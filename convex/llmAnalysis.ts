// convex/llmAnalysis.ts
/** biome-ignore-all lint/suspicious/noExplicitAny: <> */

import { ConvexError, v } from "convex/values";
import Groq from "groq-sdk";

import { api } from "./_generated/api";
import { action } from "./_generated/server";

const ISSUES_PER_BATCH = 1;
const DELAY_MS = 1_000;

const MODELS = [
	process.env.GROQ_MODEL_1,
	process.env.GROQ_MODEL_2,
	process.env.GROQ_MODEL_3,
	process.env.GROQ_MODEL_4,
	process.env.GROQ_MODEL_5,
];

function pickModel(counter: number): string {
	return MODELS[counter % MODELS.length] as string;
}

export const analyzeIssues = action({
	args: { reportId: v.id("reports"), keyword: v.string() },
	handler: async (ctx, args) => {
		const { reportId, keyword } = args;
		const report = await ctx.runQuery(api.githubIssues.getReport, {
			reportId,
		});
		if (!report) throw new ConvexError("Report not found");

		const groqApiKey = process.env.GROQ_API_KEY;
		if (!groqApiKey) throw new ConvexError("GROQ_API_KEY is not set");
		const groq = new Groq({ apiKey: groqApiKey });

		const counter = report.requestCounter || 0;
		const model = pickModel(counter);

		const issuesToAnalyze = report.issues
			.filter((i) => i.relevanceScore === 0 && i.explanation === "")
			.slice(0, ISSUES_PER_BATCH);

		if (issuesToAnalyze.length === 0) {
			await ctx.runAction(api.resend.sendReportEmail.sendReportEmail, {
				reportId,
			});
			return;
		}

		const updatedIssues = [...report.issues];

		for (const issue of issuesToAnalyze) {
			try {
				const prompt = `
Analyze the following GitHub issue for relevance to the keyword "${keyword}".
Issue Title: ${issue.title}
Issue Body: ${issue.body || "No body provided"}

Return ONLY valid JSON:
{"relevanceScore": 0-100, "explanation": "short 1-2 sentence reason"}
`.trim();

				const chatCompletion = await groq.chat.completions.create({
					messages: [{ role: "user", content: prompt }],
					model,
				});

				const raw = chatCompletion.choices[0]?.message?.content || "{}";
				const parsed = JSON.parse(raw) as {
					relevanceScore?: unknown;
					explanation?: unknown;
				};

				const relevanceScore =
					typeof parsed.relevanceScore === "number"
						? Math.max(0, Math.min(100, parsed.relevanceScore))
						: 0;

				const explanation =
					typeof parsed.explanation === "string"
						? parsed.explanation
						: "No explanation";

				const idx = updatedIssues.findIndex((i) => i.id === issue.id);
				if (idx !== -1) {
					updatedIssues[idx] = {
						...updatedIssues[idx],
						relevanceScore,
						explanation,
					};
				}
			} catch {
				const idx = updatedIssues.findIndex((i) => i.id === issue.id);
				if (idx !== -1) {
					updatedIssues[idx] = {
						...updatedIssues[idx],
						relevanceScore: 0,
						explanation: "Analysis failed",
					};
				}
			}
		}

		await ctx.runMutation(api.githubIssues.incrementRequestCounter, {
			reportId,
		});

		await ctx.runMutation(api.githubIssues.updateReport, {
			reportId,
			issues: updatedIssues,
			batchCursor: report.batchCursor,
			isComplete: report.isComplete,
		});

		const remaining = updatedIssues.filter(
			(i) => i.relevanceScore === 0 && i.explanation === "",
		).length;

		if (remaining > 0) {
			await ctx.scheduler.runAfter(
				DELAY_MS,
				api.llmAnalysis.analyzeIssues,
				{
					reportId,
					keyword,
				},
			);
		} else {
			await ctx.runAction(api.resend.sendReportEmail.sendReportEmail, {
				reportId,
			});
		}
	},
});
