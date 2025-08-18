// convex/llmClient.ts
/** biome-ignore-all lint/suspicious/noExplicitAny: <> */

import { ConvexError } from "convex/values";
import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
const OPENAI_COMPATIBLE_BASE_URL = process.env.OPENAI_COMPATIBLE_BASE_URL;
const MODEL = process.env.LLM_MODEL as string;

export const openai = new OpenAI({
	apiKey: OPENAI_API_KEY,
	baseURL: OPENAI_COMPATIBLE_BASE_URL,
});

function stripFences(s: string) {
	return s
		.replace(/^\s*```(?:json)?/i, "")
		.replace(/```\s*$/, "")
		.trim();
}
function endWithPeriod(s: string) {
	const t = s.trim();
	return /[.!?]$/.test(t) ? t : `${t}.`;
}
function enforceNonMultipleOfFive(n: number, salt: number) {
	if (!Number.isFinite(n)) return 0;
	const c = Math.max(0, Math.min(100, Math.round(n)));
	if (c === 0 || c === 100) return c;
	if (c % 5 !== 0) return c;
	return salt % 2 === 0 ? Math.min(100, c + 1) : Math.max(0, c - 1);
}

export type AnalysisResult = {
	relevanceScore: number;
	explanation: string;
	matchedTerms?: string[];
	evidence?: string[];
};

export async function analyzeIssueOpenAIStyle(opts: {
	keyword: string;
	issue: {
		id: string;
		number: number;
		title: string;
		body: string;
		labels: string[];
		createdAt: string;
	};
	maxTokens?: number;
}): Promise<AnalysisResult> {
	const { keyword, issue, maxTokens = 260 } = opts;

	const prompt = `
        You are ranking GitHub issues for relevance to the keyword: "${keyword}".

        Rules:
        - Consider TITLE (0.45), BODY (0.35), LABELS (0.20).
        - Accept synonyms/aliases of the keyword.
        - Prefer concrete evidence (error messages, API names).
        - EXPLANATION: 1-2 sentences (220 chars), mention where match was found.
        - Output strictly MINIFIED JSON (no markdown).

        Respond ONLY with:
        {"relevanceScore": <0-100 integer not a multiple of 5>, "explanation": "<1-2 sentences, 80-220 chars>", "matchedTerms": ["..."], "evidence": ["<short excerpt or reason>"]}

        Issue:
        TITLE: ${issue.title}
        LABELS: ${issue.labels.join(", ") || "none"}
        BODY:
        ${(issue.body || "").slice(0, 3000)}
        `.trim();

	let full = "";
	try {
		const stream = await openai.chat.completions.create({
			model: MODEL,
			messages: [{ role: "user", content: prompt }],
			temperature: 0.3,
			max_tokens: maxTokens,
			stream: true,
		});

		for await (const chunk of stream) {
			full += chunk.choices?.[0]?.delta?.content ?? "";
		}
		if (!full) throw new ConvexError("Empty LLM response");

		const clean = stripFences(full);
		let parsed: any;
		try {
			parsed = JSON.parse(clean);
		} catch {
			const m = clean.match(/"relevanceScore"\s*:\s*(\d+)/);
			const e = clean.match(/"explanation"\s*:\s*"([^"]{0,260})"/);
			parsed = {
				relevanceScore: m ? +m[1] : 0,
				explanation: e?.[1] ?? "Unable to analyze",
				matchedTerms: [],
				evidence: [],
			};
		}

		const scoreRaw = Number(parsed.relevanceScore ?? 0);
		const score = enforceNonMultipleOfFive(scoreRaw, issue.number);
		const explanation = endWithPeriod(
			String(parsed.explanation ?? "").slice(0, 260),
		);
		const matchedTerms = Array.isArray(parsed.matchedTerms)
			? parsed.matchedTerms.slice(0, 6)
			: [];
		const evidence = Array.isArray(parsed.evidence)
			? parsed.evidence.slice(0, 4)
			: [];

		return { relevanceScore: score, explanation, matchedTerms, evidence };
	} catch (err: any) {
		throw new ConvexError(err?.message ?? "LLM call failed");
	}
}
