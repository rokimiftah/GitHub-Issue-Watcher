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
	args: {
		reportId: v.id("reports"),
	},
	handler: async (ctx, args) => {
		const report = (await ctx.runQuery(api.githubIssues.getReport, {
			reportId: args.reportId,
		})) as Doc<"reports"> | null;
		if (!report) {
			throw new ConvexError("Report not found");
		}

		try {
			const relevantIssues = report.issues
				.filter((issue: Issue) => issue.relevanceScore > 50)
				.sort((a, b) => b.relevanceScore - a.relevanceScore);

			if (relevantIssues.length > 0) {
				const html = await renderIssueReportEmail({
					repoUrl: report.repoUrl,
					keyword: report.keyword,
					userEmail: report.userEmail,
					issues: relevantIssues,
				});

				await resend.sendEmail(ctx, {
					from: "GitHub Issue Watcher <notification@giw.rokimiftah.id>",
					to: report.userEmail,
					subject: `GIW - GitHub Issues Report for ${report.repoUrl} (${report.isComplete ? "Complete" : "Partial"})`,
					html,
				});
			}

			if (!report.isComplete && report.batchCursor) {
				await ctx.runAction(api.githubIssues.processNextBatch, {
					reportId: args.reportId,
				});
			}
		} catch (error) {
			throw new ConvexError(
				error instanceof Error
					? `Failed to send email: ${error.message}`
					: "Unknown error sending email",
			);
		}
	},
});
