// convex/llmWorker.ts
/** biome-ignore-all lint/suspicious/noExplicitAny: <> */

import type { Id } from "./_generated/dataModel";

import { ConvexError, v } from "convex/values";

import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { analyzeIssueOpenAIStyle } from "./llmClient";

const MAX_CONCURRENT = 3;
const ESTIMATE_TOKENS_DEFAULT = 1300;
const MAX_TOKENS = 260;

/* ===================== Locks ===================== */
export const acquireLock = mutation({
	args: { name: v.string(), ttlMs: v.number() },
	handler: async (ctx, args) => {
		const now = Date.now();
		const lock = await ctx.db
			.query("locks")
			.withIndex("name", (q) => q.eq("name", args.name))
			.first();
		if (!lock) {
			await ctx.db.insert("locks", {
				name: args.name,
				leaseExpiresAt: now + args.ttlMs,
				owner: "llmWorker",
			});
			return true;
		}
		if (lock.leaseExpiresAt < now) {
			await ctx.db.patch(lock._id, {
				leaseExpiresAt: now + args.ttlMs,
				owner: "llmWorker",
			});
			return true;
		}
		return false;
	},
});

export const releaseLock = mutation({
	args: { name: v.string() },
	handler: async (ctx, args) => {
		const lock = await ctx.db
			.query("locks")
			.withIndex("name", (q) => q.eq("name", args.name))
			.first();
		if (lock)
			await ctx.db.patch(lock._id, {
				leaseExpiresAt: 0,
				owner: undefined,
			});
	},
});

/* =============== Task queue ops =============== */
export const enqueueAnalysisTasks = mutation({
	args: {
		reportId: v.id("reports"),
		ownerUserId: v.id("users"),
		keyword: v.string(),
		issues: v.array(
			v.object({
				id: v.string(),
				number: v.number(),
				title: v.string(),
				body: v.string(),
				labels: v.array(v.string()),
				createdAt: v.string(),
			}),
		),
		priority: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const prio = args.priority ?? 100;
		let inserted = 0;
		for (const issue of args.issues) {
			await ctx.db.insert("analysis_tasks", {
				reportId: args.reportId,
				ownerUserId: args.ownerUserId,
				keyword: args.keyword,
				issue,
				estTokens: ESTIMATE_TOKENS_DEFAULT,
				status: "queued",
				priority: prio,
				attempts: 0,
				createdAt: now,
				updatedAt: now,
			});
			inserted++;
		}
		console.log(
			"[GIW][enqueue] report:",
			String(args.reportId),
			"inserted:",
			inserted,
		);
	},
});

export const getQueuedTasks = query({
	args: { limit: v.number() },
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query("analysis_tasks")
			.withIndex("status_priority", (q) => q.eq("status", "queued"))
			.collect();
		const selected = all
			.sort(
				(a: any, b: any) =>
					a.priority - b.priority || a.createdAt - b.createdAt,
			)
			.slice(0, args.limit);
		console.log(
			"[GIW][getQueued] totalQueued:",
			all.length,
			"selected:",
			selected.length,
		);
		return selected;
	},
});

export const markTasksRunning = mutation({
	args: { ids: v.array(v.id("analysis_tasks")) },
	handler: async (ctx, args) => {
		const now = Date.now();
		for (const id of args.ids) {
			await ctx.db.patch(id, { status: "running", updatedAt: now });
		}
	},
});

export const markTaskDone = mutation({
	args: { id: v.id("analysis_tasks") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, {
			status: "done",
			updatedAt: Date.now(),
			error: undefined,
		});
	},
});

export const markTaskRequeueOrError = mutation({
	args: {
		id: v.id("analysis_tasks"),
		attempts: v.number(),
		error: v.string(),
	},
	handler: async (ctx, args) => {
		const status = args.attempts >= 3 ? "error" : "queued";
		await ctx.db.patch(args.id, {
			status,
			attempts: args.attempts,
			updatedAt: Date.now(),
			error: args.error,
		});
	},
});

/* =============== Update result ke report =============== */
export const updateIssueResult = mutation({
	args: {
		reportId: v.id("reports"),
		issueId: v.string(),
		relevanceScore: v.number(),
		explanation: v.string(),
		matchedTerms: v.optional(v.array(v.string())),
		evidence: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const report = await ctx.db.get(args.reportId);
		if (!report) throw new ConvexError("Report not found");
		const issues = report.issues.map((it: any) =>
			it.id === args.issueId
				? {
						...it,
						relevanceScore: args.relevanceScore,
						explanation: args.explanation,
						matchedTerms: args.matchedTerms ?? [],
						evidence: args.evidence ?? [],
					}
				: it,
		);
		await ctx.db.patch(args.reportId, { issues, lastFetched: Date.now() });
	},
});

/* =============== Util untuk cek status batch =============== */
function pendingCount(report: any) {
	return report.issues.filter(
		(i: any) =>
			i.relevanceScore === 0 &&
			(i.explanation === "" || i.explanation.includes("Analysis")),
	).length;
}

/* =============== Rescue: cari report yang siap next batch saat antrian kosong =============== */
export const getReportsReadyForNextBatch = query({
	args: { limit: v.number() },
	handler: async (ctx, args) => {
		const candidates = await ctx.db
			.query("reports")
			.filter((q) => q.eq(q.field("isComplete"), false))
			.collect();

		const ready = candidates
			.filter((r: any) => !!r.batchCursor && pendingCount(r) === 0)
			.sort((a: any, b: any) => a.createdAt - b.createdAt)
			.slice(0, args.limit);

		console.log("[GIW][readyNextBatch] found:", ready.length);
		return ready.map((r: any) => r._id);
	},
});

export const countActiveTasksForReport = query({
	args: { reportId: v.id("reports") },
	handler: async (ctx, args) => {
		const hasQueued = !!(await ctx.db
			.query("analysis_tasks")
			.withIndex("report_status", (q) =>
				q.eq("reportId", args.reportId).eq("status", "queued"),
			)
			.first());

		const hasRunning = !!(await ctx.db
			.query("analysis_tasks")
			.withIndex("report_status", (q) =>
				q.eq("reportId", args.reportId).eq("status", "running"),
			)
			.first());

		const queued = hasQueued ? 1 : 0;
		const running = hasRunning ? 1 : 0;
		const total = queued + running;

		return { queued, running, total };
	},
});

export const tick = action({
	args: {},
	handler: async (ctx) => {
		console.log("[GIW][tick] try acquire lock");
		const got = await ctx.runMutation(api.llmWorker.acquireLock, {
			name: "llm_worker",
			ttlMs: 15000,
		});
		console.log("[GIW][tick] acquire result:", got);
		if (!got) return;

		try {
			const quota = await ctx.runQuery(api.rateLimiter.getQuota, {
				estimateTokens: ESTIMATE_TOKENS_DEFAULT,
			});
			console.log("[GIW][tick] quota", quota);
			if (!quota.ok) {
				console.log("[GIW][tick] quota blocked → sleep");
				await ctx.scheduler.runAfter(5000, api.llmWorker.tick, {});
				return;
			}

			const BATCH = Math.min(quota.maxRequests, 4);
			const queued = await ctx.runQuery(api.llmWorker.getQueuedTasks, {
				limit: BATCH,
			});
			console.log("[GIW][tick] queued selected", {
				requested: BATCH,
				got: queued.length,
			});

			if (queued.length === 0) {
				const ready = await ctx.runQuery(
					api.llmWorker.getReportsReadyForNextBatch,
					{ limit: 3 },
				);
				if (ready.length > 0) {
					console.log(
						"[GIW][tick] rescue → trigger processNextBatch for",
						ready.length,
						"report(s)",
					);
					for (const reportId of ready) {
						await ctx.scheduler.runAfter(
							0,
							api.githubIssues.processNextBatch,
							{ reportId },
						);
					}
					await ctx.scheduler.runAfter(1500, api.llmWorker.tick, {});
					return;
				}
				console.log("[GIW][tick] nothing queued → sleep");
				await ctx.scheduler.runAfter(10000, api.llmWorker.tick, {});
				return;
			}

			await ctx.runMutation(api.llmWorker.markTasksRunning, {
				ids: queued.map((t) => t._id),
			});

			await ctx.runMutation(api.rateLimiter.consume, {
				requests: queued.length,
				tokens: queued.length * ESTIMATE_TOKENS_DEFAULT,
			});

			for (let i = 0; i < queued.length; i += MAX_CONCURRENT) {
				const chunk = queued.slice(i, i + MAX_CONCURRENT);
				await Promise.all(
					chunk.map(async (task) => {
						try {
							const res = await analyzeIssueOpenAIStyle({
								keyword: task.keyword,
								issue: task.issue,
								maxTokens: MAX_TOKENS,
							});

							await ctx.runMutation(
								api.llmWorker.updateIssueResult,
								{
									reportId: task.reportId,
									issueId: task.issue.id,
									relevanceScore: res.relevanceScore,
									explanation: res.explanation,
									matchedTerms: res.matchedTerms ?? [],
									evidence: res.evidence ?? [],
								},
							);

							await ctx.runMutation(api.llmWorker.markTaskDone, {
								id: task._id,
							});
						} catch (err: any) {
							const attempts = (task.attempts ?? 0) + 1;
							await ctx.runMutation(
								api.llmWorker.markTaskRequeueOrError,
								{
									id: task._id,
									attempts,
									error: String(err?.message ?? err),
								},
							);
						}
					}),
				);
			}

			const touchedReportIds = Array.from(
				new Set(queued.map((t) => String(t.reportId))),
			);
			for (const ridStr of touchedReportIds) {
				const rid = ridStr as unknown as Id<"reports">;
				const report = await ctx.runQuery(api.githubIssues.getReport, {
					reportId: rid,
				});
				if (!report) continue;

				const remaining = report.issues.filter(
					(i: any) =>
						i.relevanceScore === 0 &&
						(i.explanation === "" ||
							i.explanation.includes("Analysis")),
				).length;

				const { total: activeTasks } = await ctx.runQuery(
					api.llmWorker.countActiveTasksForReport,
					{ reportId: rid },
				);

				console.log("[GIW][tick] post-batch state", {
					reportId: String(rid),
					remaining,
					activeTasks,
					cursor: report.batchCursor ?? null,
					isComplete: report.isComplete,
				});

				if (
					remaining === 0 &&
					!report.batchCursor &&
					activeTasks === 0 &&
					!report.isComplete
				) {
					console.log("[GIW][tick] finalize report:", String(rid));
					await ctx.runMutation(api.githubIssues.updateReport, {
						reportId: rid,
						issues: report.issues,
						batchCursor: undefined,
						isComplete: true,
					});
					await ctx.scheduler.runAfter(
						0,
						api.resend.sendReportEmail.sendReportEmail,
						{ reportId: rid },
					);
					continue;
				}

				if (
					remaining === 0 &&
					report.batchCursor &&
					activeTasks === 0
				) {
					console.log(
						"[GIW][tick] partial email + next batch for:",
						String(rid),
					);
					await ctx.scheduler.runAfter(
						0,
						api.resend.sendReportEmail.sendReportEmail,
						{ reportId: rid },
					);
					await ctx.scheduler.runAfter(
						0,
						api.githubIssues.processNextBatch,
						{ reportId: rid },
					);
				}
			}

			await ctx.scheduler.runAfter(1000, api.llmWorker.tick, {});
			console.log("[GIW][tick] reschedule next tick");
		} finally {
			await ctx.runMutation(api.llmWorker.releaseLock, {
				name: "llm_worker",
			});
			console.log("[GIW][tick] lock released");
		}
	},
});

export const cancelQueuedTasksForReport = mutation({
	args: { reportId: v.id("reports") },
	handler: async (ctx, args) => {
		const toCancel = await ctx.db
			.query("analysis_tasks")
			.withIndex("report_status", (q) =>
				q.eq("reportId", args.reportId).eq("status", "queued"),
			)
			.collect();
		for (const t of toCancel) {
			await ctx.db.patch(t._id, {
				status: "canceled",
				updatedAt: Date.now(),
			});
		}
		console.log(
			"[GIW][cancelTasks] canceled:",
			toCancel.length,
			"for report",
			String(args.reportId),
		);
	},
});
