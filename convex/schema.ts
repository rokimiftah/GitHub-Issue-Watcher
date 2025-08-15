// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
	...authTables,

	users: defineTable({
		name: v.optional(v.string()),
		image: v.optional(v.string()),
		email: v.optional(v.string()),
		emailVerificationTime: v.optional(v.number()),
		linkedProviders: v.optional(v.array(v.string())),
	}).index("email", ["email"]),

	reports: defineTable({
		repoUrl: v.string(),
		keyword: v.string(),
		userEmail: v.string(),
		userId: v.id("users"),
		issues: v.array(
			v.object({
				id: v.string(),
				number: v.number(),
				title: v.string(),
				body: v.string(),
				labels: v.array(v.string()),
				createdAt: v.string(),
				relevanceScore: v.number(),
				explanation: v.string(),
			}),
		),
		createdAt: v.number(),
		lastFetched: v.number(),
		batchCursor: v.optional(v.string()),
		isComplete: v.boolean(),
		emailsSent: v.optional(v.number()),
		requestCounter: v.optional(v.number()),
	})
		.index("userEmail", ["userEmail"])
		.index("userId", ["userId"])
		.index("repoUrl_keyword", ["repoUrl", "keyword"]),
});
