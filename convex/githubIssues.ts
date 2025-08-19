// convex/githubIssues.ts
/** biome-ignore-all lint/suspicious/noExplicitAny: <> */

import type { Id } from "./_generated/dataModel";

import { ConvexError, v } from "convex/values";

import { getAuthUserId } from "@convex-dev/auth/server";

import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";

const IssueArg = v.object({
	id: v.string(),
	number: v.number(),
	title: v.string(),
	body: v.string(),
	labels: v.array(v.string()),
	createdAt: v.string(),
	relevanceScore: v.number(),
	explanation: v.string(),
	matchedTerms: v.optional(v.array(v.string())),
	evidence: v.optional(v.array(v.string())),
});

export const saveReport = mutation({
	args: {
		repoUrl: v.string(),
		keyword: v.string(),
		userEmail: v.string(),
		issues: v.array(IssueArg),
		batchCursor: v.optional(v.string()),
		isComplete: v.boolean(),
	},
	handler: async (ctx, args) => {
		console.log("[GIW][saveReport] insert", {
			repoUrl: args.repoUrl,
			keyword: args.keyword,
			issues: args.issues.length,
		});

		const { repoUrl, keyword, userEmail, issues, batchCursor, isComplete } =
			args;
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new ConvexError(
				"User must be authenticated to save a report",
			);
		}
		if (
			!/^https:\/\/github.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(
				repoUrl,
			)
		) {
			throw new ConvexError("Invalid GitHub repository URL");
		}
		try {
			const reportId: Id<"reports"> = await ctx.db.insert("reports", {
				repoUrl,
				keyword,
				userEmail,
				userId,
				issues,
				createdAt: Date.now(),
				lastFetched: Date.now(),
				batchCursor,
				isComplete,
			});
			console.log("[GIW][saveReport] ok", { reportId });
			return reportId;
		} catch (error) {
			throw new ConvexError(
				error instanceof Error
					? `Failed to save report: ${error.message}`
					: "Unknown error saving report",
			);
		}
	},
});

export const updateReport = mutation({
	args: {
		reportId: v.id("reports"),
		issues: v.array(IssueArg),
		batchCursor: v.optional(v.string()),
		isComplete: v.boolean(),
		requestCounter: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { reportId, issues, batchCursor, isComplete } = args;
		console.log("[GIW][updateReport] patch", {
			reportId,
			issues: issues.length,
			hasCursor: !!batchCursor,
			isComplete,
		});
		try {
			await ctx.db.patch(reportId, {
				issues,
				lastFetched: Date.now(),
				batchCursor,
				isComplete,
			});
		} catch (error) {
			throw new ConvexError(
				error instanceof Error
					? `Failed to update report: ${error.message}`
					: "Unknown error updating report",
			);
		}
	},
});

export const getReport = query({
	args: { reportId: v.id("reports") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.reportId);
	},
});

export const getUserReports = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			return [];
		}
		return await ctx.db
			.query("reports")
			.withIndex("userId", (q) => q.eq("userId", userId))
			.collect();
	},
});

export const getReportByRepoAndKeyword = query({
	args: {
		repoUrl: v.string(),
		keyword: v.string(),
	},
	handler: async (ctx, args) => {
		const kw = args.keyword.toLowerCase();
		return await ctx.db
			.query("reports")
			.withIndex("repoUrl_keyword", (q) =>
				q.eq("repoUrl", args.repoUrl).eq("keyword", kw),
			)
			.first();
	},
});

export const storeIssues = action({
	args: {
		repoUrl: v.string(),
		keyword: v.string(),
		userEmail: v.string(),
	},
	handler: async (ctx, args): Promise<Id<"reports">> => {
		const { repoUrl, keyword, userEmail } = args;
		console.log("[GIW][storeIssues] start", {
			repoUrl,
			keyword,
			userEmail,
		});

		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("User must be authenticated");

		if (!/^https:\/\/github\.com\/[\w-]+\/[\w-]+$/.test(repoUrl)) {
			throw new ConvexError("Invalid GitHub repository URL");
		}

		const normalizedKeyword = keyword.toLowerCase();

		const existingReport = await ctx.runQuery(
			api.githubIssues.getReportByRepoAndKeyword,
			{ repoUrl, keyword },
		);
		console.log("[GIW][storeIssues] existingReport?", {
			exists: !!existingReport,
			isComplete: existingReport?.isComplete,
			lastFetched: existingReport?.lastFetched,
			batchCursor: existingReport?.batchCursor,
		});

		if (
			existingReport?.isComplete &&
			Date.now() - existingReport.lastFetched < 1 * 60 * 60 * 1000
		) {
			console.log("[GIW][storeIssues] cache hit → reuse report", {
				reportId: existingReport._id,
			});
			return existingReport._id;
		}

		console.log("[GIW][storeIssues] fetchIssuesBatch → call");
		const { issues, pageInfo } = await ctx.runAction(
			api.githubActions.fetchIssuesBatch,
			{
				repoUrl,
				batchSize: 50,
				after: existingReport?.batchCursor,
			},
		);
		console.log("[GIW][storeIssues] fetchIssuesBatch → ok", {
			fetched: issues.length,
			hasNextPage: pageInfo?.hasNextPage,
			endCursor: pageInfo?.endCursor,
		});

		let reportId: Id<"reports">;
		if (existingReport) {
			reportId = existingReport._id;

			await ctx.runMutation(api.githubIssues.updateReport, {
				reportId,
				issues: [...existingReport.issues, ...issues],
				batchCursor: pageInfo.hasNextPage
					? pageInfo.endCursor
					: undefined,
				isComplete: false,
			});
			console.log("[GIW][storeIssues] report updated", {
				reportId,
				totalIssues: existingReport.issues.length + issues.length,
			});
		} else {
			reportId = await ctx.runMutation(api.githubIssues.saveReport, {
				repoUrl,
				keyword: normalizedKeyword,
				userEmail,
				issues,
				batchCursor: pageInfo.hasNextPage
					? pageInfo.endCursor
					: undefined,
				isComplete: false,
			});
			console.log("[GIW][storeIssues] report created", {
				reportId,
				issues: issues.length,
			});
		}

		await ctx.runMutation(api.llmWorker.enqueueAnalysisTasks, {
			reportId,
			ownerUserId: userId,
			keyword: normalizedKeyword,
			issues: issues.map(
				({ id, number, title, body, labels, createdAt }) => ({
					id,
					number,
					title,
					body,
					labels,
					createdAt,
				}),
			),
			priority: 100,
		});
		console.log("[GIW][storeIssues] enqueueAnalysisTasks done", {
			reportId,
			enqueued: issues.length,
		});

		await ctx.scheduler.runAfter(0, api.llmWorker.tick, {});
		console.log("[GIW][storeIssues] tick scheduled");

		return reportId;
	},
});

export const processNextBatch = action({
	args: { reportId: v.id("reports") },
	handler: async (ctx, args) => {
		console.log("[GIW][processNextBatch] start", {
			reportId: args.reportId,
		});
		const report = await ctx.runQuery(api.githubIssues.getReport, {
			reportId: args.reportId,
		});
		if (!report || report.isComplete || !report.batchCursor) {
			console.log("[GIW][processNextBatch] nothing to do", {
				found: !!report,
				isComplete: report?.isComplete,
				hasCursor: !!report?.batchCursor,
			});
			if (report?.isComplete) {
				await ctx.runAction(
					api.resend.sendReportEmail.sendReportEmail,
					{
						reportId: args.reportId,
					},
				);
				console.log("[GIW][processNextBatch] final email scheduled");
			}
			return;
		}

		const batchSize = 50;

		console.log("[GIW][processNextBatch] fetch next batch", {
			repoUrl: report.repoUrl,
			batchSize,
			after: report.batchCursor,
		});
		const { issues, pageInfo } = await ctx.runAction(
			api.githubActions.fetchIssuesBatch,
			{
				repoUrl: report.repoUrl,
				batchSize,
				after: report.batchCursor,
			},
		);
		console.log("[GIW][processNextBatch] fetch ok", {
			fetched: issues.length,
			hasNextPage: pageInfo?.hasNextPage,
			endCursor: pageInfo?.endCursor,
		});

		const allIssues = [...report.issues, ...issues];

		await ctx.runMutation(api.githubIssues.updateReport, {
			reportId: args.reportId,
			issues: allIssues,
			batchCursor: pageInfo.hasNextPage ? pageInfo.endCursor : undefined,
			isComplete: false,
		});
		console.log("[GIW][processNextBatch] report patched", {
			reportId: args.reportId,
			totalIssues: allIssues.length,
		});

		await ctx.runMutation(api.llmWorker.enqueueAnalysisTasks, {
			reportId: args.reportId,
			ownerUserId: report.userId,
			keyword: report.keyword,
			issues: issues.map(
				({ id, number, title, body, labels, createdAt }) => ({
					id,
					number,
					title,
					body,
					labels,
					createdAt,
				}),
			),
			priority: 100,
		});
		console.log("[GIW][processNextBatch] tasks enqueued", {
			reportId: args.reportId,
			enqueued: issues.length,
		});
		await ctx.scheduler.runAfter(0, api.llmWorker.tick, {});
		console.log("[GIW][processNextBatch] tick scheduled");
	},
});

export const incrementEmailsSent = mutation({
	args: { reportId: v.id("reports") },
	handler: async (ctx, args) => {
		const report = await ctx.db.get(args.reportId);
		if (!report) throw new ConvexError("Report not found");
		await ctx.db.patch(args.reportId, {
			emailsSent: (report.emailsSent || 0) + 1,
		});
		console.log("[GIW][incrementEmailsSent] +1", {
			reportId: args.reportId,
			emailsSent: (report.emailsSent || 0) + 1,
		});
	},
});

export const checkIncompleteReport = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return { hasIncomplete: false };

		const openReport = await ctx.db
			.query("reports")
			.withIndex("userId", (q) => q.eq("userId", userId))
			.filter((q) => q.eq(q.field("isComplete"), false))
			.first();
		if (openReport) return { hasIncomplete: true };

		const anyQueued = await ctx.db
			.query("analysis_tasks")
			.withIndex("owner_status", (q) =>
				q.eq("ownerUserId", userId).eq("status", "queued"),
			)
			.first();
		if (anyQueued) return { hasIncomplete: true };

		const anyRunning = await ctx.db
			.query("analysis_tasks")
			.withIndex("owner_status", (q) =>
				q.eq("ownerUserId", userId).eq("status", "running"),
			)
			.first();

		return { hasIncomplete: !!anyRunning };
	},
});

export const incrementRequestCounter = mutation({
	args: { reportId: v.id("reports") },
	handler: async (ctx, args) => {
		const report = await ctx.db.get(args.reportId);
		if (!report) return;
		await ctx.db.patch(args.reportId, {
			requestCounter: (report.requestCounter || 0) + 1,
		});
		console.log("[GIW][incrementRequestCounter] +1", {
			reportId: args.reportId,
			requestCounter: (report.requestCounter || 0) + 1,
		});
	},
});

export const updateEmailMeta = mutation({
	args: {
		reportId: v.id("reports"),
		lastPartialEmailAt: v.optional(v.number()),
		lastPartialDigest: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const patch: any = {};
		if (args.lastPartialEmailAt !== undefined)
			patch.lastPartialEmailAt = args.lastPartialEmailAt;
		if (args.lastPartialDigest !== undefined)
			patch.lastPartialDigest = args.lastPartialDigest;
		await ctx.db.patch(args.reportId, patch);
	},
});

export const markFinalEmailSent = mutation({
	args: { reportId: v.id("reports") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.reportId, { finalEmailAt: Date.now() });
	},
});

export const setLastPartialCursor = mutation({
	args: { reportId: v.id("reports"), cursor: v.string() },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.reportId, { lastPartialCursor: args.cursor });
	},
});

export const getWorkloadStatus = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return { openReports: 0, queued: 0, running: 0 };

		const openReports = await ctx.db
			.query("reports")
			.withIndex("userId", (q) => q.eq("userId", userId))
			.filter((q) => q.eq(q.field("isComplete"), false))
			.collect();

		const queued = await ctx.db
			.query("analysis_tasks")
			.withIndex("owner_status", (q) =>
				q.eq("ownerUserId", userId).eq("status", "queued"),
			)
			.collect();

		const running = await ctx.db
			.query("analysis_tasks")
			.withIndex("owner_status", (q) =>
				q.eq("ownerUserId", userId).eq("status", "running"),
			)
			.collect();

		return {
			openReports: openReports.length,
			queued: queued.length,
			running: running.length,
		};
	},
});
