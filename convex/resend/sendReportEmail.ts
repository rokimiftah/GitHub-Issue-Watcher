// convex/resend/sendReportEmail.ts

import type { Doc } from "../_generated/dataModel";

import { ConvexError, v } from "convex/values";

import { Resend } from "@convex-dev/resend";

import { api, components } from "../_generated/api";
import { action } from "../_generated/server";
import { renderIssueReportEmail } from "../../src/components/dashboard/template/IssueReportEmail";

interface Issue {
	id: string;
	number: number;
	title: string;
	body: string;
	labels: string[];
	createdAt: string;
	relevanceScore: number;
	explanation: string;
}

export const resend: Resend = new Resend(components.resend, {
	testMode: false,
});

export const sendReportEmail = action({
	args: { reportId: v.id("reports") },
	handler: async (ctx, args) => {
		const report = (await ctx.runQuery(api.githubIssues.getReport, {
			reportId: args.reportId,
		})) as Doc<"reports"> | null;
		if (!report) throw new ConvexError("Report not found");

		const relevantIssues = report.issues
			.filter((i: Issue) => i.relevanceScore > 50)
			.sort((a, b) => b.relevanceScore - a.relevanceScore);

		console.log("[EMAIL][prepare]", {
			reportId: String(args.reportId),
			isComplete: report.isComplete,
			cursor: report.batchCursor ?? null,
			relevant: relevantIssues.length,
			lastPartialCursor: report.lastPartialCursor ?? null,
			finalEmailAt: report.finalEmailAt ?? null,
		});

		if (report.isComplete && report.finalEmailAt) {
			console.log("[EMAIL] Final already sent, skip.");
			return;
		}

		if (!report.isComplete) {
			const currentCursorKey = report.batchCursor ?? "__NO_CURSOR__";
			if (report.lastPartialCursor === currentCursorKey) {
				console.log(
					"[EMAIL] Partial already sent for this cursor, skip.",
				);
				return;
			}
		}

		if (relevantIssues.length === 0) {
			console.log("[EMAIL] No relevant issues to send.");
			if (!report.isComplete && report.batchCursor) {
				await ctx.scheduler.runAfter(
					0,
					api.githubIssues.processNextBatch,
					{
						reportId: args.reportId,
					},
				);
			}
			return;
		}

		const emailsSent = report.emailsSent ?? 0;
		const emailType = report.isComplete ? "Final" : "Partial";
		const batchNumber =
			report.isComplete && emailsSent === 0 ? "" : ` - ${emailsSent + 1}`;

		try {
			const html = await renderIssueReportEmail({
				repoUrl: report.repoUrl,
				keyword: report.keyword,
				userEmail: report.userEmail,
				issues: relevantIssues,
			});

			await resend.sendEmail(ctx, {
				from: "GitHub Issue Watcher <notification@giw.rokimiftah.id>",
				to: report.userEmail,
				subject: `GIW - GitHub Issues Report for ${report.repoUrl} (${emailType}${batchNumber})`,
				html,
			});

			await ctx.runMutation(api.githubIssues.incrementEmailsSent, {
				reportId: args.reportId,
			});

			if (report.isComplete) {
				await ctx.runMutation(api.githubIssues.markFinalEmailSent, {
					reportId: args.reportId,
				});
			} else {
				await ctx.runMutation(api.githubIssues.setLastPartialCursor, {
					reportId: args.reportId,
					cursor: report.batchCursor ?? "__NO_CURSOR__",
				});
			}

			console.log(
				`[EMAIL SENT] ${emailType}${batchNumber} - ${relevantIssues.length} issues for report ${args.reportId}`,
			);

			if (!report.isComplete && report.batchCursor) {
				await ctx.scheduler.runAfter(
					0,
					api.githubIssues.processNextBatch,
					{
						reportId: args.reportId,
					},
				);
			}
		} catch (error) {
			console.error("[sendReportEmail] Error:", error);
			throw new ConvexError(
				error instanceof Error
					? error.message.includes("GitHub authentication failed")
						? "Failed to send email due to invalid GITHUB_TOKEN."
						: `Failed to send email: ${error.message}`
					: "Unknown error sending email",
			);
		}
	},
});
