// convex/githubIssues.ts
import type { Id } from "./_generated/dataModel";

import { ConvexError, v } from "convex/values";

import { getAuthUserId } from "@convex-dev/auth/server";

import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";

export const saveReport = mutation({
	args: {
		repoUrl: v.string(),
		keyword: v.string(),
		userEmail: v.string(),
		issues: v.array(
			v.object({
				id: v.string(),
				number: v.number(),
				title: v.string(),
				body: v.string(),
				labels: v.array(v.string()),
				createdAt: v.string(),
				relevanceScore: v.number(),
				explanation: v.string(),
			}),
		),
		batchCursor: v.optional(v.string()),
		isComplete: v.boolean(),
	},
	handler: async (ctx, args) => {
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
		issues: v.array(
			v.object({
				id: v.string(),
				number: v.number(),
				title: v.string(),
				body: v.string(),
				labels: v.array(v.string()),
				createdAt: v.string(),
				relevanceScore: v.number(),
				explanation: v.string(),
			}),
		),
		batchCursor: v.optional(v.string()),
		isComplete: v.boolean(),
	},
	handler: async (ctx, args) => {
		const { reportId, issues, batchCursor, isComplete } = args;
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
		return await ctx.db
			.query("reports")
			.withIndex("repoUrl_keyword", (q) =>
				q.eq("repoUrl", args.repoUrl).eq("keyword", args.keyword),
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
		const batchSize = 100;
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new ConvexError("User must be authenticated");
		}
		if (
			!/^https:\/\/github.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(
				repoUrl,
			)
		) {
			throw new ConvexError("Invalid GitHub repository URL");
		}

		try {
			const existingReport = await ctx.runQuery(
				api.githubIssues.getReportByRepoAndKeyword,
				{
					repoUrl,
					keyword,
				},
			);

			if (
				existingReport?.isComplete &&
				Date.now() - existingReport.lastFetched < 24 * 60 * 60 * 1000
			) {
				return existingReport._id;
			}

			const { issues, pageInfo } = await ctx.runAction(
				api.githubActions.fetchIssuesBatch,
				{
					repoUrl,
					batchSize,
					after: existingReport?.batchCursor,
				},
			);

			let reportId: Id<"reports">;
			if (existingReport) {
				reportId = existingReport._id;
				await ctx.runMutation(api.githubIssues.updateReport, {
					reportId,
					issues: [...existingReport.issues, ...issues],
					batchCursor: pageInfo.hasNextPage
						? pageInfo.endCursor
						: undefined,
					isComplete: !pageInfo.hasNextPage,
				});
			} else {
				reportId = await ctx.runMutation(api.githubIssues.saveReport, {
					repoUrl,
					keyword,
					userEmail,
					issues,
					batchCursor: pageInfo.hasNextPage
						? pageInfo.endCursor
						: undefined,
					isComplete: !pageInfo.hasNextPage,
				});
			}

			await ctx.runAction(api.llmAnalysis.analyzeIssues, {
				reportId,
				keyword,
			});

			await ctx.runAction(api.resend.sendReportEmail.sendReportEmail, {
				reportId,
			});

			return reportId;
		} catch (error) {
			throw new ConvexError(
				error instanceof Error
					? `Failed to process issues: ${error.message}`
					: "Unknown error processing issues",
			);
		}
	},
});

export const processNextBatch = action({
	args: {
		reportId: v.id("reports"),
	},
	handler: async (ctx, args) => {
		const report = await ctx.runQuery(api.githubIssues.getReport, {
			reportId: args.reportId,
		});
		if (!report || report.isComplete || !report.batchCursor) {
			return;
		}

		const batchSize = 100;

		const { issues, pageInfo } = await ctx.runAction(
			api.githubActions.fetchIssuesBatch,
			{
				repoUrl: report.repoUrl,
				batchSize,
				after: report.batchCursor,
			},
		);

		await ctx.runMutation(api.githubIssues.updateReport, {
			reportId: args.reportId,
			issues: [...report.issues, ...issues],
			batchCursor: pageInfo.hasNextPage ? pageInfo.endCursor : undefined,
			isComplete: !pageInfo.hasNextPage,
		});

		await ctx.runAction(api.llmAnalysis.analyzeIssues, {
			reportId: args.reportId,
			keyword: report.keyword,
		});

		await ctx.runAction(api.resend.sendReportEmail.sendReportEmail, {
			reportId: args.reportId,
		});
	},
});
