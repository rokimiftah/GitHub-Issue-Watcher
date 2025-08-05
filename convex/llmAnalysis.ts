// convex/llmAnalysis.ts

import { ConvexError, v } from "convex/values";
import Groq from "groq-sdk";

import { api } from "./_generated/api";
import { action, internalMutation, mutation } from "./_generated/server";

interface Issue {
	id: string;
	number: number;
	title: string;
	body: string;
	labels: string[];
	createdAt: string;
	relevanceScore: number;
	explanation: string;
}

export const saveAnalysisCache = mutation({
	args: {
		repoUrl: v.string(),
		keyword: v.string(),
		issueId: v.string(),
		relevanceScore: v.number(),
		explanation: v.string(),
		analyzedAt: v.number(),
	},
	handler: async (ctx, args) => {
		try {
			await ctx.db.insert("issueAnalysisCache", {
				repoUrl: args.repoUrl,
				keyword: args.keyword,
				issueId: args.issueId,
				relevanceScore: args.relevanceScore,
				explanation: args.explanation,
				analyzedAt: args.analyzedAt,
			});
		} catch (error) {
			throw new ConvexError(
				error instanceof Error
					? `Failed to save analysis cache: ${error.message}`
					: "Unknown error saving analysis cache",
			);
		}
	},
});

export const analyzeIssues = action({
	args: {
		reportId: v.id("reports"),
		keyword: v.string(),
	},
	handler: async (ctx, args) => {
		const { reportId, keyword } = args;
		const report = await ctx.runQuery(api.githubIssues.getReport, {
			reportId,
		});
		if (!report) {
			throw new ConvexError("Report not found");
		}

		const groqApiKey = process.env.GROQ_API_KEY;
		if (!groqApiKey) {
			throw new ConvexError("GROQ_API_KEY is not set");
		}

		const groq = new Groq({ apiKey: groqApiKey });
		const updatedIssues: Issue[] = [];

		for (const issue of report.issues as Issue[]) {
			const cachedAnalysis = await ctx.runQuery(
				api.githubIssues.getCachedAnalysis,
				{
					repoUrl: report.repoUrl,
					keyword,
					issueId: issue.id,
				},
			);

			if (
				cachedAnalysis &&
				Date.now() - cachedAnalysis.analyzedAt < 24 * 60 * 60 * 1000
			) {
				updatedIssues.push({
					...issue,
					relevanceScore: cachedAnalysis.relevanceScore,
					explanation: cachedAnalysis.explanation,
				});
				continue;
			}

			try {
				const prompt = `
          Analyze the following GitHub issue for relevance to the keyword "${keyword}".
          Issue Title: ${issue.title}
          Issue Body: ${issue.body || "No body provided"}
          
          Provide a JSON response with:
          - relevanceScore: A number between 0 and 100 indicating relevance.
          - explanation: A short explanation (1-2 sentences) of why the issue is relevant or not.
        `;

				const chatCompletion = await groq.chat.completions.create({
					messages: [{ role: "user", content: prompt }],
					model: "moonshotai/kimi-k2-instruct",
					response_format: { type: "json_object" },
				});

				const result = JSON.parse(
					chatCompletion.choices[0]?.message?.content || "{}",
				);
				const { relevanceScore, explanation } = result;

				if (
					typeof relevanceScore !== "number" ||
					relevanceScore < 0 ||
					relevanceScore > 100
				) {
					throw new Error("Invalid relevanceScore from Groq API");
				}
				if (
					typeof explanation !== "string" ||
					explanation.length === 0
				) {
					throw new Error("Invalid explanation from Groq API");
				}

				await ctx.runMutation(api.llmAnalysis.saveAnalysisCache, {
					repoUrl: report.repoUrl,
					keyword,
					issueId: issue.id,
					relevanceScore,
					explanation,
					analyzedAt: Date.now(),
				});

				updatedIssues.push({
					...issue,
					relevanceScore,
					explanation,
				});
			} catch (_error) {
				updatedIssues.push({
					...issue,
					relevanceScore: 0,
					explanation: "Analysis failed due to API error.",
				});
			}
		}

		await ctx.runMutation(api.githubIssues.updateReport, {
			reportId,
			issues: updatedIssues,
			batchCursor: report.batchCursor,
			isComplete: report.isComplete,
		});

		return updatedIssues;
	},
});

export const cleanExpiredCache = internalMutation({
	args: {},
	handler: async (ctx) => {
		const expiredCaches = await ctx.db
			.query("issueAnalysisCache")
			.filter((q) =>
				q.lt(q.field("analyzedAt"), Date.now() - 24 * 60 * 60 * 1000),
			)
			.collect();
		for (const cache of expiredCaches) {
			await ctx.db.delete(cache._id);
		}
	},
});
