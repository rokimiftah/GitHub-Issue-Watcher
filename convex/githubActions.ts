// convex/githubActions.ts
import { ConvexError, v } from "convex/values";

import { graphql } from "@octokit/graphql";

import { action } from "./_generated/server";

export const fetchIssuesBatch = action({
	args: {
		repoUrl: v.string(),
		batchSize: v.number(),
		after: v.optional(v.string()),
	},
	handler: async (_ctx, args) => {
		const { repoUrl, batchSize, after } = args;

		const githubToken = process.env.GITHUB_TOKEN;
		if (!githubToken) {
			throw new ConvexError("GITHUB_TOKEN is not set");
		}

		const [owner, repo] = repoUrl
			.replace("https://github.com/", "")
			.split("/");
		if (!owner || !repo) {
			throw new ConvexError("Invalid repository URL");
		}

		try {
			const graphqlWithAuth = graphql.defaults({
				headers: { authorization: `token ${githubToken}` },
			});

			const query = `
query ($owner: String!, $repo: String!, $batchSize: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    issues(first: $batchSize, states: [OPEN, CLOSED], after: $after) {
      nodes {
        id
        number
        title
        body
        labels(first: 10) {
          nodes {
            name
          }
        }
        createdAt
        state
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
  rateLimit {
    remaining
    resetAt
  }
}
				`;

			type GitHubIssue = {
				id: string;
				number: number;
				title: string;
				body: string | null;
				labels: { nodes: { name: string }[] };
				createdAt: string;
				state: "OPEN" | "CLOSED";
			};

			const response: {
				repository: {
					issues: {
						nodes: GitHubIssue[];
						pageInfo: { endCursor: string; hasNextPage: boolean };
					};
				};
				rateLimit: { remaining: number; resetAt: string };
			} = await graphqlWithAuth({
				query,
				owner,
				repo,
				batchSize,
				after,
			});

			console.log(
				`Rate limit remaining: ${response.rateLimit.remaining}, resets at: ${response.rateLimit.resetAt}`,
			);

			if (response.rateLimit.remaining < 100) {
				const resetTime = new Date(
					response.rateLimit.resetAt,
				).getTime();
				const delay = resetTime - Date.now();
				if (delay > 0) {
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}

			const issues = response.repository.issues.nodes.map(
				(issue: GitHubIssue) => ({
					id: issue.id,
					number: issue.number,
					title: issue.title,
					body: issue.body || "",
					labels: issue.labels.nodes.map((label) => label.name),
					createdAt: issue.createdAt,
					relevanceScore: 0,
					explanation: "",
				}),
			);

			return {
				issues,
				pageInfo: response.repository.issues.pageInfo,
			};
		} catch (error) {
			if (error instanceof Error && error.message.includes("401")) {
				throw new ConvexError(
					"GitHub authentication failed. Please check the GITHUB_TOKEN.",
				);
			}
			throw new ConvexError(
				error instanceof Error
					? `Failed to fetch issues: ${error.message}`
					: "Unknown error fetching issues",
			);
		}
	},
});
