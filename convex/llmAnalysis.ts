/** biome-ignore-all lint/suspicious/noExplicitAny: <> */

import { ConvexError, v } from "convex/values";

import Cerebras from "@cerebras/cerebras_cloud_sdk";

import { api } from "./_generated/api";
import { action } from "./_generated/server";

interface CerebrasStreamChunk {
	choices: Array<{
		delta?: {
			content?: string;
		};
	}>;
	headers?: Record<string, string>;
}

const ISSUES_PER_BATCH = 5;
const DELAY_MS = 1_500;
const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;

function extractAndParseJSON(text: string): {
	relevanceScore: number;
	explanation: string;
} {
	try {
		const parsed = JSON.parse(text);
		if (parsed.relevanceScore && parsed.explanation) {
			return {
				relevanceScore: Math.max(
					0,
					Math.min(100, Number(parsed.relevanceScore)),
				),
				explanation: String(parsed.explanation).substring(0, 200),
			};
		}
	} catch {
		const scoreMatch = text.match(/"relevanceScore"\s*:\s*(\d+(?:\.\d+)?)/);
		const explanationMatch = text.match(/"explanation"\s*:\s*"([^"]*)"/);

		if (scoreMatch && explanationMatch) {
			return {
				relevanceScore: Math.max(
					0,
					Math.min(100, parseInt(scoreMatch[1])),
				),
				explanation: explanationMatch[1].substring(0, 200),
			};
		}
	}

	return { relevanceScore: 0, explanation: "Unable to analyze" };
}

async function safeAnalyzeIssue(
	cerebras: Cerebras,
	prompt: string,
	model: string,
	issue: any,
): Promise<{ relevanceScore: number; explanation: string }> {
	let fullResponse = "";
	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			const stream = await cerebras.chat.completions.create({
				messages: [{ role: "user", content: prompt }],
				model,
				temperature: 0.1,
				max_completion_tokens: 150,
				stream: true,
			});

			for await (const chunk of stream as AsyncIterable<CerebrasStreamChunk>) {
				const content = chunk.choices[0]?.delta?.content || "";
				fullResponse += content;
			}

			if (!fullResponse) {
				throw new Error("Empty response");
			}

			console.log(`[AI Response] Issue #${issue.number}:`, fullResponse);

			const result = extractAndParseJSON(fullResponse);

			if (
				typeof result.relevanceScore === "number" &&
				result.relevanceScore >= 0 &&
				result.relevanceScore <= 100 &&
				result.explanation
			) {
				return result;
			}

			throw new Error("Invalid analysis format");
		} catch (error: any) {
			console.error(
				`[Analysis Error] Issue #${issue.number}, Attempt ${attempt}:`,
				error,
			);

			if (attempt === MAX_RETRIES) {
				console.log(
					`[Failure] Max retries reached for Issue #${issue.number}, returning default`,
				);
				return {
					relevanceScore: 0,
					explanation: "Analysis failed after retries",
				};
			}

			// Fallback to exponential backoff
			const retryAfter = error.response?.headers?.["retry-after"]
				? parseInt(error.response.headers["retry-after"]) * 1000
				: 1000 * attempt;
			await new Promise((resolve) => setTimeout(resolve, retryAfter));
		}
	}

	return { relevanceScore: 0, explanation: "Analysis failed after retries" };
}

export const analyzeIssues = action({
	args: { reportId: v.id("reports"), keyword: v.string() },
	handler: async (ctx, args) => {
		const { reportId, keyword } = args;
		const report = await ctx.runQuery(api.githubIssues.getReport, {
			reportId,
		});

		if (!report) throw new ConvexError("Report not found");

		const cerebrasApiKey = process.env.CEREBRAS_API_KEY;
		if (!cerebrasApiKey)
			throw new ConvexError("CEREBRAS_API_KEY is not set");

		const cerebras = new Cerebras({ apiKey: cerebrasApiKey });
		const model = process.env.LLM_MODEL as string;

		const issuesToAnalyze = report.issues
			.filter(
				(i) =>
					i.relevanceScore === 0 &&
					(i.explanation === "" ||
						i.explanation.includes("Analysis failed")),
			)
			.slice(0, ISSUES_PER_BATCH);

		if (issuesToAnalyze.length === 0) {
			console.log(
				`[Analysis Complete] All issues analyzed for report ${reportId}`,
			);
			await ctx.runAction(api.resend.sendReportEmail.sendReportEmail, {
				reportId,
			});
			return;
		}

		console.log(
			`[Processing] Analyzing ${issuesToAnalyze.length} issues with model: ${model}`,
		);

		const updatedIssues = [...report.issues];

		// Process issues in small batches
		for (let i = 0; i < issuesToAnalyze.length; i += MAX_CONCURRENT) {
			const batch = issuesToAnalyze.slice(i, i + MAX_CONCURRENT);

			const results = await Promise.allSettled(
				batch.map(async (issue) => {
					const prompt = `
						Analyze the following GitHub issue for relevance to the keyword '${keyword}' (case-insensitive). 
						Evaluate the issue's title, body, labels, and comments for direct mentions, synonyms, or related concepts to the keyword, 
						allowing for flexible interpretation to capture broader relevance. 
						Consider variations in case (e.g., "auth", "Auth", "AUTH") as the same keyword.
						
						Issue Title: ${issue.title}
						Issue Body: ${issue.body || "No description"}
						Issue Labels: ${issue.labels.join(", ")}
						
						RESPOND ONLY WITH: {"relevanceScore": 75, "explanation": "Brief reason"}`;

					return await safeAnalyzeIssue(
						cerebras,
						prompt,
						model,
						issue,
					);
				}),
			);

			// Process results
			results.forEach((result, index) => {
				const issue = batch[index];
				const idx = updatedIssues.findIndex((i) => i.id === issue.id);

				if (idx !== -1) {
					if (result.status === "fulfilled") {
						updatedIssues[idx] = {
							...updatedIssues[idx],
							...result.value,
						};
					} else {
						updatedIssues[idx] = {
							...updatedIssues[idx],
							relevanceScore: 0,
							explanation: "Analysis temporarily unavailable",
						};
					}
				}
			});

			if (i + MAX_CONCURRENT < issuesToAnalyze.length) {
				await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
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

		// Check remaining issues
		const remaining = updatedIssues.filter(
			(i) =>
				i.relevanceScore === 0 &&
				(i.explanation === "" ||
					i.explanation.includes("Analysis failed")),
		).length;

		console.log(`[Progress] ${remaining} issues remaining for analysis`);

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
			console.log(`[Complete] All issues analyzed, sending report email`);
			await ctx.runAction(api.resend.sendReportEmail.sendReportEmail, {
				reportId,
			});
		}
	},
});

// Action retry failed analyses
export const retryFailedAnalyses = action({
	args: { reportId: v.id("reports"), keyword: v.string() },
	handler: async (ctx, args) => {
		console.log(
			`[Retry] Attempting to retry failed analyses for report ${args.reportId}`,
		);
		await ctx.runAction(api.llmAnalysis.analyzeIssues, {
			reportId: args.reportId,
			keyword: args.keyword,
		});
	},
});
