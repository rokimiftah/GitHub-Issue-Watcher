// convex/llmAnalysis.ts
import { ConvexError, v } from "convex/values";
import Groq from "groq-sdk";

import { api } from "./_generated/api";
import { action } from "./_generated/server";

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
		if (!report) throw new ConvexError("Report not found");

		const groqApiKey = process.env.GROQ_API_KEY;
		if (!groqApiKey) throw new ConvexError("GROQ_API_KEY is not set");

		const groq = new Groq({ apiKey: groqApiKey });

		// Ambil 20 issue yang belum dianalisis
		const issuesToAnalyze = report.issues
			.filter(
				(issue) =>
					issue.relevanceScore === 0 && issue.explanation === "",
			)
			.slice(0, 20);

		if (issuesToAnalyze.length === 0) {
			// Semua sudah dianalisis
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
          Provide a JSON response with:
          - relevanceScore: A number between 0 and 100.
          - explanation: A short 1-2 sentence explanation.
        `;

				const chatCompletion = await groq.chat.completions.create({
					messages: [{ role: "user", content: prompt }],
					model: "llama-3.1-8b-instant",
					response_format: { type: "json_object" },
				});

				const result = JSON.parse(
					chatCompletion.choices[0]?.message?.content || "{}",
				);
				const { relevanceScore, explanation } = result;

				const index = updatedIssues.findIndex((i) => i.id === issue.id);
				if (index !== -1) {
					updatedIssues[index] = {
						...updatedIssues[index],
						relevanceScore:
							typeof relevanceScore === "number"
								? relevanceScore
								: 0,
						explanation:
							typeof explanation === "string"
								? explanation
								: "No explanation",
					};
				}
			} catch {
				const index = updatedIssues.findIndex((i) => i.id === issue.id);
				if (index !== -1) {
					updatedIssues[index] = {
						...updatedIssues[index],
						relevanceScore: 0,
						explanation: "Analysis failed",
					};
				}
			}
		}

		await ctx.runMutation(api.githubIssues.updateReport, {
			reportId,
			issues: updatedIssues,
			batchCursor: report.batchCursor,
			isComplete: report.isComplete,
		});

		// ⭐ Jika masih ada issue yang belum dianalisis, lanjutkan
		const remaining = updatedIssues.filter(
			(issue) => issue.relevanceScore === 0 && issue.explanation === "",
		).length;

		if (remaining > 0) {
			await ctx.scheduler.runAfter(0, api.llmAnalysis.analyzeIssues, {
				reportId,
				keyword,
			});
		} else {
			// Semua sudah dianalisis
			await ctx.runAction(api.resend.sendReportEmail.sendReportEmail, {
				reportId,
			});
		}
	},
});
