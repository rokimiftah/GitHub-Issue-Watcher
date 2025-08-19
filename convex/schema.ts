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
				matchedTerms: v.optional(v.array(v.string())),
				evidence: v.optional(v.array(v.string())),
			}),
		),
		createdAt: v.number(),
		lastFetched: v.number(),
		batchCursor: v.optional(v.string()),
		isComplete: v.boolean(),
		emailsSent: v.optional(v.number()),
		requestCounter: v.optional(v.number()),
		lastPartialEmailAt: v.optional(v.number()),
		lastPartialDigest: v.optional(v.string()),
		lastPartialCursor: v.optional(v.string()),
		finalEmailAt: v.optional(v.number()),
	})
		.index("userEmail", ["userEmail"])
		.index("userId", ["userId"])
		.index("repoUrl_keyword", ["repoUrl", "keyword"]),

	analysis_tasks: defineTable({
		reportId: v.id("reports"),
		ownerUserId: v.id("users"),
		keyword: v.string(),
		issue: v.object({
			id: v.string(),
			number: v.number(),
			title: v.string(),
			body: v.string(),
			labels: v.array(v.string()),
			createdAt: v.string(),
		}),
		estTokens: v.number(),
		status: v.string(),
		priority: v.number(),
		attempts: v.number(),
		error: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("status_priority", ["status", "priority"])
		.index("report_status", ["reportId", "status"])
		.index("owner_status", ["ownerUserId", "status"])
		.index("status_createdAt", ["status", "createdAt"]),

	rate_limits: defineTable({
		bucket: v.string(),
		requests: v.number(),
		tokens: v.number(),
		updatedAt: v.number(),
	}).index("bucket", ["bucket"]),

	locks: defineTable({
		name: v.string(),
		leaseExpiresAt: v.number(),
		owner: v.optional(v.string()),
	}).index("name", ["name"]),
});
