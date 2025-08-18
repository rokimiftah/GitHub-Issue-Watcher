// convex/llmAnalysis.ts
/** biome-ignore-all lint/suspicious/noExplicitAny: <> */

import { ConvexError, v } from "convex/values";
import OpenAI from "openai";

import { api } from "./_generated/api";
import { action } from "./_generated/server";

const ISSUES_PER_BATCH = 3;
const DELAY_MS = 1_500;
const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;

function enforceNonMultipleOfFive(n: number, salt: number): number {
	if (!Number.isFinite(n)) return 0;
	const clamped = Math.max(0, Math.min(100, Math.round(n)));
	if (clamped === 0 || clamped === 100) return clamped;
	if (clamped % 5 !== 0) return clamped;
	return salt % 2 === 0
		? Math.min(100, clamped + 1)
		: Math.max(0, clamped - 1);
}

function stripFences(s: string): string {
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
	openai: OpenAI,
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
			console.log("[GIW][LLM] request", {
				issueNo: issue.number,
				attempt,
				model,
			});
			const stream = await openai.chat.completions.create({
				model,
				messages: [{ role: "user", content: prompt }],
				temperature: 0.3,
				max_tokens: 260,
				stream: true,
			});

			for await (const chunk of stream) {
				fullResponse += chunk.choices?.[0]?.delta?.content ?? "";
			}

			if (!fullResponse) throw new Error("Empty response");

			const parsed = extractAndParseJSON(fullResponse);

			parsed.relevanceScore = enforceNonMultipleOfFive(
				parsed.relevanceScore,
				issue.number,
			);

			return parsed;
		} catch (error: any) {
			console.warn("[GIW][LLM] error", {
				issueNo: issue.number,
				attempt,
				message: String(error?.message ?? error),
			});
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
			console.log("[GIW][LLM] backoff(ms)", retryAfter);
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
		console.log("[GIW][analyzeIssues] start", { reportId, keyword });
		const report = await ctx.runQuery(api.githubIssues.getReport, {
			reportId,
		});

		if (!report) throw new ConvexError("Report not found");

		const openai = new OpenAI({
			apiKey: process.env.OPENAI_API_KEY,
			baseURL: process.env.OPENAI_COMPATIBLE_BASE_URL,
		});

		const model = process.env.LLM_MODEL as string;

		const issuesToAnalyze = report.issues
			.filter(
				(i) =>
					i.relevanceScore === 0 &&
					(i.explanation === "" ||
						i.explanation.includes("Analysis failed")),
			)
			.slice(0, ISSUES_PER_BATCH);

		console.log("[GIW][analyzeIssues] plan", {
			pick: issuesToAnalyze.length,
			hasCursor: !!report.batchCursor,
		});

		if (issuesToAnalyze.length === 0) {
			console.log("[GIW][analyzeIssues] no issues to analyze", {
				hasCursor: !!report.batchCursor,
			});
			const allUnanalyzedIssues = report.issues.filter(
				(i) =>
					i.relevanceScore === 0 &&
					(i.explanation === "" ||
						i.explanation.includes("Analysis failed")),
			).length;
			const isComplete = !report.batchCursor && allUnanalyzedIssues === 0;

			if (isComplete && !report.isComplete) {
				console.log("[GIW][analyzeIssues] Marking complete", {
					reportId,
				});
				await ctx.runMutation(api.githubIssues.updateReport, {
					reportId,
					issues: report.issues,
					batchCursor: undefined,
					isComplete: true,
				});
			}

			console.log(
				"[GIW][analyzeIssues] email scheduled (no pending issues)",
				{
					reportId,
				},
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

		for (let i = 0; i < issuesToAnalyze.length; i += MAX_CONCURRENT) {
			const batch = issuesToAnalyze.slice(i, i + MAX_CONCURRENT);
			console.log("[GIW][analyzeIssues] chunk", {
				from: i,
				size: batch.length,
			});

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

					return await safeAnalyzeIssue(openai, prompt, model, issue);
				}),
			);

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
		console.log("[GIW][analyzeIssues] requestCounter++", { reportId });

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
		console.log("[GIW][analyzeIssues] patched", {
			remaining: allUnanalyzedIssues,
			isComplete,
		});

		if (allUnanalyzedIssues > 0) {
			await ctx.scheduler.runAfter(
				DELAY_MS,
				api.llmAnalysis.analyzeIssues,
				{
					reportId,
					keyword,
				},
			);
			console.log("[GIW][analyzeIssues] rescheduled self", {
				delayMs: DELAY_MS,
			});
		} else {
			await ctx.scheduler.runAfter(
				0,
				api.resend.sendReportEmail.sendReportEmail,
				{
					reportId,
				},
			);
			console.log("[GIW][analyzeIssues] final email scheduled", {
				reportId,
			});
		}
	},
});

export const retryFailedAnalyses = action({
	args: { reportId: v.id("reports"), keyword: v.string() },
	handler: async (ctx, args) => {
		console.log(
			"[GIW][Retry] Attempting to retry failed analyses",
			args.reportId,
		);
		await ctx.runAction(api.llmAnalysis.analyzeIssues, {
			reportId: args.reportId,
			keyword: args.keyword,
		});
	},
});
