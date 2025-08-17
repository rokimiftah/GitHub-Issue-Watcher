// convex/llmAnalysis.ts
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

function enforceNonMultipleOfFive(n: number, salt: number): number {
	if (!Number.isFinite(n)) return 0;
	const clamped = Math.max(0, Math.min(100, Math.round(n)));
	if (clamped === 0 || clamped === 100) return clamped;
	if (clamped % 5 !== 0) return clamped;
	// Shear +1 or -1 deterministic based on "salt" (eg issue.number)
	return salt % 2 === 0
		? Math.min(100, clamped + 1)
		: Math.max(0, clamped - 1);
}

function stripFences(s: string): string {
	// Discard the possibility of `` `json ...` ``
	return s
		.replace(/^\s*```(?:json)?/i, "")
		.replace(/```\s*$/, "")
		.trim();
}

function endWithPeriod(s: string) {
	const t = s.trim();
	return /[.!?]$/.test(t) ? t : `${t}.`;
}

function extractAndParseJSON(text: string): {
	relevanceScore: number;
	explanation: string;
	matchedTerms?: string[];
	evidence?: string[];
} {
	const clean = stripFences(text);
	try {
		const j = JSON.parse(clean);
		const raw = Number(j.relevanceScore ?? 0);
		const score = Number.isFinite(raw)
			? Math.max(0, Math.min(100, raw))
			: 0;

		const expl = String(j.explanation ?? "").slice(0, 260);

		return {
			relevanceScore: score,
			explanation: endWithPeriod(expl),
			matchedTerms: Array.isArray(j.matchedTerms)
				? j.matchedTerms.slice(0, 6)
				: [],
			evidence: Array.isArray(j.evidence) ? j.evidence.slice(0, 4) : [],
		};
	} catch {
		const m = clean.match(/"relevanceScore"\s*:\s*(\d+)/);
		const e = clean.match(/"explanation"\s*:\s*"([^"]{0,260})"/);
		return {
			relevanceScore: m ? Math.max(0, Math.min(100, +m[1])) : 0,
			explanation: endWithPeriod(e?.[1] ?? "Unable to analyze"),
			matchedTerms: [],
			evidence: [],
		};
	}
}

async function safeAnalyzeIssue(
	cerebras: Cerebras,
	prompt: string,
	model: string,
	issue: any,
): Promise<{
	relevanceScore: number;
	explanation: string;
	matchedTerms?: string[];
	evidence?: string[];
}> {
	let fullResponse = "";
	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			const stream = await cerebras.chat.completions.create({
				messages: [{ role: "user", content: prompt }],
				model,
				temperature: 0.3,
				max_completion_tokens: 260,
				stream: true,
			});

			for await (const chunk of stream as AsyncIterable<CerebrasStreamChunk>) {
				const content = chunk.choices[0]?.delta?.content || "";
				fullResponse += content;
			}

			if (!fullResponse) throw new Error("Empty response");

			const parsed = extractAndParseJSON(fullResponse);

			parsed.relevanceScore = enforceNonMultipleOfFive(
				parsed.relevanceScore,
				issue.number,
			);

			return parsed;
		} catch (error: any) {
			if (attempt === MAX_RETRIES) {
				return {
					relevanceScore: 0,
					explanation: "Analysis failed after retries",
					matchedTerms: [],
					evidence: [],
				};
			}
			const retryAfter = error.response?.headers?.["retry-after"]
				? parseInt(error.response.headers["retry-after"]) * 1000
				: 1000 * attempt;
			await new Promise((r) => setTimeout(r, retryAfter));
		}
	}

	return {
		relevanceScore: 0,
		explanation: "Analysis failed after retries",
		matchedTerms: [],
		evidence: [],
	};
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

		console.log(
			`[analyzeIssues] Report ${reportId}: issuesToAnalyze=${issuesToAnalyze.length}, isComplete=${report.isComplete}, batchCursor=${report.batchCursor}`,
		);

		if (issuesToAnalyze.length === 0) {
			console.log(
				`[analyzeIssues] No issues to analyze for report ${reportId}`,
			);
			const allUnanalyzedIssues = report.issues.filter(
				(i) =>
					i.relevanceScore === 0 &&
					(i.explanation === "" ||
						i.explanation.includes("Analysis failed")),
			).length;
			const isComplete = !report.batchCursor && allUnanalyzedIssues === 0;

			if (isComplete && !report.isComplete) {
				console.log(
					`[analyzeIssues] Marking report ${reportId} as complete`,
				);
				await ctx.runMutation(api.githubIssues.updateReport, {
					reportId,
					issues: report.issues,
					batchCursor: undefined,
					isComplete: true,
				});
			}

			console.log(
				`[analyzeIssues] Scheduling email for report ${reportId}`,
			);
			await ctx.scheduler.runAfter(
				0,
				api.resend.sendReportEmail.sendReportEmail,
				{
					reportId,
				},
			);
			return;
		}

		console.log(
			`[Processing] Analyzing ${issuesToAnalyze.length} issues with model: ${model} for report ${reportId}`,
		);

		const updatedIssues = [...report.issues];

		// Process issues in small batches
		for (let i = 0; i < issuesToAnalyze.length; i += MAX_CONCURRENT) {
			const batch = issuesToAnalyze.slice(i, i + MAX_CONCURRENT);

			const results = await Promise.allSettled(
				batch.map(async (issue) => {
					const prompt = `
						You are ranking GitHub issues for relevance to the keyword: "${keyword}".

						Rules:
						- Consider TITLE (weight 0.45), BODY (0.35), LABELS (0.20).
						- Accept synonyms, inflections, and aliases of the keyword.
						- Prefer concrete evidence (error messages, repro steps, API names).
						- EXPLANATION MUST BE 1-2 COMPLETE SENTENCES (not fragments), 80-220 characters, referencing where the match was found (title/body/labels) and why it's relevant.
						- Output strictly MINIFIED JSON (no markdown, no extra text).

						Respond ONLY with:
						{"relevanceScore": <0-100 integer not a multiple of 5>, "explanation": "<1-2 sentences, 80-220 chars>", "matchedTerms": ["..."], "evidence": ["<short excerpt or reason>"]}

						Issue:
						TITLE: ${issue.title}
						LABELS: ${issue.labels.join(", ") || "none"}
						BODY:
						${(issue.body || "").slice(0, 3000)}`;

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
						const {
							relevanceScore,
							explanation,
							matchedTerms,
							evidence,
						} = result.value;
						updatedIssues[idx] = {
							...updatedIssues[idx],
							relevanceScore,
							explanation,
							matchedTerms: matchedTerms ?? [],
							evidence: evidence ?? [],
						};
					} else {
						updatedIssues[idx] = {
							...updatedIssues[idx],
							relevanceScore: 0,
							explanation: "Analysis temporarily unavailable",
							matchedTerms: [],
							evidence: [],
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

		const allUnanalyzedIssues = updatedIssues.filter(
			(i) =>
				i.relevanceScore === 0 &&
				(i.explanation === "" ||
					i.explanation.includes("Analysis failed")),
		).length;
		const isComplete = !report.batchCursor && allUnanalyzedIssues === 0;

		await ctx.runMutation(api.githubIssues.updateReport, {
			reportId,
			issues: updatedIssues,
			batchCursor: report.batchCursor,
			isComplete,
		});

		console.log(
			`[analyzeIssues] Report ${reportId}: ${allUnanalyzedIssues} issues remaining, isComplete: ${isComplete}`,
		);

		if (allUnanalyzedIssues > 0) {
			console.log(
				`[analyzeIssues] Scheduling analysis for remaining issues for report ${reportId}`,
			);
			await ctx.scheduler.runAfter(
				DELAY_MS,
				api.llmAnalysis.analyzeIssues,
				{
					reportId,
					keyword,
				},
			);
		} else {
			console.log(
				`[analyzeIssues] All issues analyzed for report ${reportId}, scheduling email`,
			);
			await ctx.scheduler.runAfter(
				0,
				api.resend.sendReportEmail.sendReportEmail,
				{
					reportId,
				},
			);
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
