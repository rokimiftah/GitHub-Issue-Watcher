// convex/rateLimiter.ts

import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

export const LIMITS = {
	RPM: 12,
	RPH: 700,
	TPM: 55_000,
	TPH: 900_000,
	ENABLE_TPD: true,
	TPD: 900_000,
};

function minuteBucket(ms: number) {
	return `m:${Math.floor(ms / 60_000)}`;
}
function hourBucket(ms: number) {
	return `h:${Math.floor(ms / 3_600_000)}`;
}
function dayBucket(ms: number) {
	return `d:${Math.floor(ms / 86_400_000)}`;
}

export const getQuota = query({
	args: { estimateTokens: v.number() },
	handler: async (ctx, args) => {
		const now = Date.now();
		const mb = minuteBucket(now);
		const hb = hourBucket(now);
		const db = dayBucket(now);

		const [m, h, d] = await Promise.all([
			ctx.db
				.query("rate_limits")
				.withIndex("bucket", (q) => q.eq("bucket", mb))
				.first(),
			ctx.db
				.query("rate_limits")
				.withIndex("bucket", (q) => q.eq("bucket", hb))
				.first(),
			ctx.db
				.query("rate_limits")
				.withIndex("bucket", (q) => q.eq("bucket", db))
				.first(),
		]);

		const reqMin = m?.requests ?? 0,
			tokMin = m?.tokens ?? 0;
		const reqHr = h?.requests ?? 0,
			tokHr = h?.tokens ?? 0;
		const tokDay = d?.tokens ?? 0;

		const allowReqByRPM = Math.max(0, LIMITS.RPM - reqMin);
		const allowReqByRPH = Math.max(0, LIMITS.RPH - reqHr);
		const allowReqByTPM = Math.max(
			0,
			Math.floor(
				(LIMITS.TPM - tokMin) / Math.max(1, args.estimateTokens),
			),
		);
		const allowReqByTPH = Math.max(
			0,
			Math.floor((LIMITS.TPH - tokHr) / Math.max(1, args.estimateTokens)),
		);
		const allowReqByTPD = LIMITS.ENABLE_TPD
			? Math.max(
					0,
					Math.floor(
						(LIMITS.TPD - tokDay) /
							Math.max(1, args.estimateTokens),
					),
				)
			: Number.MAX_SAFE_INTEGER;

		const maxRequests = Math.min(
			allowReqByRPM,
			allowReqByRPH,
			allowReqByTPM,
			allowReqByTPH,
			allowReqByTPD,
		);

		console.log("[GIW][rateLimiter.getQuota]", {
			estimateTokens: args.estimateTokens,
			allowReqByRPM,
			allowReqByRPH,
			allowReqByTPM,
			allowReqByTPH,
			allowReqByTPD,
			maxRequests,
			minuteRemainingTokens: Math.max(0, LIMITS.TPM - tokMin),
			hourRemainingTokens: Math.max(0, LIMITS.TPH - tokHr),
		});

		return {
			ok: maxRequests > 0,
			maxRequests,
			minuteRemainingTokens: Math.max(0, LIMITS.TPM - tokMin),
			hourRemainingTokens: Math.max(0, LIMITS.TPH - tokHr),
		};
	},
});

export const consume = mutation({
	args: { requests: v.number(), tokens: v.number() },
	handler: async (ctx, args) => {
		const now = Date.now();
		const buckets = [
			minuteBucket(now),
			hourBucket(now),
			LIMITS.ENABLE_TPD ? dayBucket(now) : null,
		].filter(Boolean) as string[];

		for (const b of buckets) {
			const doc = await ctx.db
				.query("rate_limits")
				.withIndex("bucket", (q) => q.eq("bucket", b))
				.first();
			if (!doc) {
				await ctx.db.insert("rate_limits", {
					bucket: b,
					requests: args.requests,
					tokens: args.tokens,
					updatedAt: now,
				});
			} else {
				await ctx.db.patch(doc._id, {
					requests: Math.max(0, doc.requests + args.requests),
					tokens: Math.max(0, doc.tokens + args.tokens),
					updatedAt: now,
				});
			}
		}

		console.log("[GIW][rateLimiter.consume]", {
			requests: args.requests,
			tokens: args.tokens,
			buckets,
		});
	},
});
