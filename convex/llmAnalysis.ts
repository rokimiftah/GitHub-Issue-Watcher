/** biome-ignore-all lint/suspicious/noExplicitAny: <> */

import { ConvexError, v } from "convex/values";
import Groq from "groq-sdk";

import { api } from "./_generated/api";
import { action } from "./_generated/server";

const ISSUES_PER_BATCH = 3;
const DELAY_MS = 2_000;
const MAX_CONCURRENT = 2;
const MAX_RETRIES = 3;

const MODELS = [
	process.env.GROQ_MODEL_1,
	process.env.GROQ_MODEL_2,
	process.env.GROQ_MODEL_3,
	process.env.GROQ_MODEL_4,
	process.env.GROQ_MODEL_5,
].filter(Boolean);

function pickModel(counter: number): string {
	const validModels = MODELS.filter((model) => model && model.trim() !== "");
	if (validModels.length === 0) {
		throw new Error("No valid models configured");
	}
	return validModels[counter % validModels.length] as string;
}

function extractAndParseJSON(text: string): {
	relevanceScore: number;
	explanation: string;
} {
	try {
		// Coba parsing langsung
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
		// Coba extract dengan regex
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

		// Jika tidak ada angka yang valid, kembalikan nilai default
		return { relevanceScore: 0, explanation: "Unable to analyze" };
	}

	return { relevanceScore: 0, explanation: "Unable to analyze" };
}

// Safe analysis dengan retry
async function safeAnalyzeIssue(
	groq: Groq,
	prompt: string,
	model: string,
	issue: any,
	_keyword: string,
): Promise<{ relevanceScore: number; explanation: string }> {
	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			const chatCompletion = await groq.chat.completions.create({
				messages: [{ role: "user", content: prompt }],
				model,
				temperature: 0.1,
				max_tokens: 150,
			});

			const raw = chatCompletion.choices[0]?.message?.content?.trim();

			if (!raw) {
				throw new Error("Empty response");
			}

			console.log(`[AI Response] Issue #${issue.number}:`, raw);

			const result = extractAndParseJSON(raw);

			// Validasi hasil
			if (
				typeof result.relevanceScore === "number" &&
				result.relevanceScore >= 0 &&
				result.relevanceScore <= 100 &&
				result.explanation
			) {
				return result;
			}

			throw new Error("Invalid analysis format");
		} catch (error) {
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

			// Exponential backoff
			await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
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

		const groqApiKey = process.env.GROQ_API_KEY;
		if (!groqApiKey) throw new ConvexError("GROQ_API_KEY is not set");

		const groq = new Groq({ apiKey: groqApiKey });
		const counter = report.requestCounter || 0;
		const model = pickModel(counter);

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

						Provide a JSON response with:
						- relevanceScore: A number between 0 and 100 indicating relevance.
						- explanation: A short explanation (1-2 sentences) of why the issue is relevant or not.
						
						Return ONLY valid JSON:
						{"relevanceScore": <number 0-100>, "explanation": "<Brief reason>"}`;

					return await safeAnalyzeIssue(
						groq,
						prompt,
						model,
						issue,
						keyword,
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

			// Small delay between concurrent batches
			if (i + MAX_CONCURRENT < issuesToAnalyze.length) {
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		}

		// Update report
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

// Tambahan: Action untuk retry failed analyses
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
