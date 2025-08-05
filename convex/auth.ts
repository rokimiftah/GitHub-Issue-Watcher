// convex/auth.ts
import type { MutationCtx } from "./_generated/server";

import { ConvexError } from "convex/values";
import { z } from "zod";

import GitHub from "@auth/core/providers/github";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

import { ResendOTP } from "./resend/ResendOTP";
import { ResendOTPPasswordReset } from "./resend/ResendOTPPasswordReset";

const PasswordSchema = z
	.string()
	.min(6, "Password must be at least 6 characters long")
	.regex(/[0-9]/, "Password must include a number")
	.regex(/[a-z]/, "Password must include a lowercase letter")
	.regex(/[A-Z]/, "Password must include an uppercase letter")
	.regex(
		/[$&+,:;=?@#|'<>.^*()%!-]/,
		"Password must include a special symbol",
	);

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		GitHub({
			allowDangerousEmailAccountLinking: true,
			profile: (params) => {
				if (typeof params.email !== "string") {
					throw new ConvexError("Email is required");
				}
				const normalizedEmail = params.email.toLowerCase().trim();
				const { error, data } = z
					.object({
						email: z.string().email("Invalid email address"),
					})
					.safeParse({ email: normalizedEmail });
				if (error) {
					throw new ConvexError(error.issues[0].message);
				}
				return {
					email: data.email,
					githubToken: params.access_token,
				};
			},
		}),
		Password({
			id: "password",
			verify: ResendOTP,
			reset: ResendOTPPasswordReset,
			profile: (params) => {
				if (typeof params.email !== "string") {
					throw new ConvexError("Email is required");
				}
				const normalizedEmail = params.email.toLowerCase().trim();
				const { error, data } = z
					.object({
						email: z.string().email("Invalid email address"),
					})
					.safeParse({ email: normalizedEmail });
				if (error) {
					throw new ConvexError(error.issues[0].message);
				}
				return { email: data.email };
			},
			validatePasswordRequirements: (password: string) => {
				const result = PasswordSchema.safeParse(password);
				if (!result.success) {
					throw new ConvexError(result.error.issues[0].message);
				}
			},
		}),
	],
	callbacks: {
		// biome-ignore lint/suspicious/noExplicitAny: <args>
		async createOrUpdateUser(ctx: MutationCtx, args: any) {
			const normalizedEmail = args.profile.email.toLowerCase().trim();
			const provider = args.type === "oauth" ? "github" : "password";
			const githubToken =
				args.type === "oauth" ? args.profile.githubToken : undefined;

			const existingUser = await ctx.db
				.query("users")
				.withIndex("email", (q) => q.eq("email", normalizedEmail))
				.first();

			if (existingUser) {
				const currentProviders = existingUser.linkedProviders || [];
				// biome-ignore lint/suspicious/noExplicitAny: <updates>
				const updates: any = {};
				if (!currentProviders.includes(provider)) {
					updates.linkedProviders = [...currentProviders, provider];
				}
				if (
					args.type === "oauth" &&
					!existingUser.emailVerificationTime
				) {
					updates.emailVerificationTime = Date.now();
				}
				if (args.type === "oauth" && githubToken) {
					updates.githubToken = githubToken;
				}
				if (Object.keys(updates).length > 0) {
					await ctx.db.patch(existingUser._id, updates);
				}
				return existingUser._id;
			}

			const userId = await ctx.db.insert("users", {
				email: normalizedEmail,
				emailVerificationTime:
					args.type === "oauth" ? Date.now() : undefined,
				linkedProviders: [provider],
				githubToken,
			});

			return userId;
		},
	},
});
