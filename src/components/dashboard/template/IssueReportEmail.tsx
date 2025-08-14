// src/components/dashboard/template/IssueReportEmail.tsx
import type { Doc } from "../../../../convex/_generated/dataModel";

interface EmailTemplateProps {
	repoUrl: string;
	keyword: string;
	userEmail: string;
	issues: Doc<"reports">["issues"];
}

export async function renderIssueReportEmail({
	repoUrl,
	keyword,
	userEmail,
	issues,
}: EmailTemplateProps): Promise<string> {
	const sortedIssues = [...issues].sort(
		(a, b) => b.relevanceScore - a.relevanceScore,
	);

	const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; color: #333; }
          h1 { color: #111110; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5d90a; text-align: center; } /* Center align th content */
          a { color: #0066cc; text-decoration: none; }
        </style>
      </head>
      <body>
        <h1>GitHub Issues Report</h1>
        <p>Dear ${userEmail},</p>
        <p>Here is your report for issues related to "${keyword}" in the repository ${repoUrl}:</p>
        <table>
          <tr>
            <th>Title</th>
            <th>Relevance Score</th>
            <th>Explanation</th>
            <th>Created At</th>
            <th>Labels</th>
          </tr>
          ${sortedIssues
				.map(
					(issue) => `
                <tr>
                  <td><a href="https://github.com/${repoUrl.replace(
						"https://github.com/",
						"",
					)}/issues/${issue.number}">${issue.title}</a></td>
                  <td>${issue.relevanceScore}</td>
                  <td>${issue.explanation}</td>
                  <td>${new Date(issue.createdAt).toLocaleDateString()}</td>
                  <td>${issue.labels.join(", ")}</td>
                </tr>
              `,
				)
				.join("")}
        </table>
        <p>${
			sortedIssues.length > 0
				? "These are the most relevant issues based on your keyword."
				: "No relevant issues found for this batch."
		}</p>
        <p>Thank you for using GitHub Issue Watcher!</p>
      </body>
    </html>
  `;
	return html;
}
