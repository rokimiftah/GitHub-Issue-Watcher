import { v } from "convex/values";

import { query } from "./_generated/server";

export const listQueuedWindow = query({
	args: {
		window: v.number(),
		cursor: v.optional(v.string()), // kalau mau paginasi lanjut
	},
	handler: async (ctx, args) => {
		const { page, isDone, continueCursor } = await ctx.db
			.query("analysis_tasks")
			.withIndex("status_createdAt", (q) => q.eq("status", "queued"))
			.order("asc")
			// ⬇️ cursor WAJIB ada -> pakai null untuk halaman pertama
			.paginate({ numItems: args.window, cursor: args.cursor ?? null });

		// kembalikan juga cursor supaya bisa lanjut kalau perlu
		return { page, isDone, continueCursor };
	},
});

export const countRunningForUser = query({
	args: { userId: v.id("users") },
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query("analysis_tasks")
			.withIndex("owner_status", (q) =>
				q.eq("ownerUserId", args.userId).eq("status", "running"),
			)
			.collect();
		return rows.length;
	},
});
