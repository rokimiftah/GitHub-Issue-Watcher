// src/components/dashboard/ui/IssuesTable.tsx
import type { Id } from "@convex/_generated/dataModel";

import { useQuery } from "convex/react";

import { api } from "@convex/_generated/api";
import { Anchor, ScrollArea, Table, Text } from "@mantine/core";

interface IssuesTableProps {
	reportId: Id<"reports">;
}

export function IssuesTable({ reportId }: IssuesTableProps) {
	const report = useQuery(api.githubIssues.getReport, { reportId });

	if (!report) return <Text>Loading...</Text>;

	const filteredIssues = report.issues
		.filter((issue) => issue.relevanceScore > 50)
		.sort((a, b) => b.relevanceScore - a.relevanceScore);

	if (filteredIssues.length === 0) {
		return (
			<Text ta="center" my="md" mt="xl">
				No issues found with relevance score above 50 for this report.
			</Text>
		);
	}

	return (
		<>
			<div className="space-y-3 md:hidden">
				{filteredIssues.map((issue) => (
					<div
						key={issue.id}
						className="rounded-md border border-neutral-600 p-4"
					>
						<h3 className="text-sm font-bold break-words">
							{issue.title}
						</h3>
						<p className="mt-1 text-xs text-neutral-400">
							Relevance: {issue.relevanceScore}/100
						</p>
						<p className="mt-2 text-xs text-neutral-300">
							{issue.explanation}
						</p>
						<div className="mt-2">
							<span className="text-xs text-neutral-400">
								Created:{" "}
								{new Date(issue.createdAt).toLocaleDateString()}
							</span>
						</div>
						<div className="mt-1">
							{issue.labels.map((label) => (
								<span
									key={label}
									className="mt-1 mr-1 inline-block rounded bg-blue-100 px-2 py-1 text-xs text-blue-800"
								>
									{label}
								</span>
							))}
						</div>
						<Anchor
							href={`https://github.com/${report.repoUrl.replace("https://github.com/", "")}/issues/${issue.number}`}
							target="_blank"
							className="mt-2 block text-xs text-blue-500 underline"
						>
							View Issue →
						</Anchor>
					</div>
				))}
			</div>

			<div className="hidden md:block">
				<ScrollArea>
					<Table highlightOnHover className="min-w-[600px]">
						<Table.Thead>
							<Table.Tr>
								<Table.Th>Title</Table.Th>
								<Table.Th>Score</Table.Th>
								<Table.Th>Explanation</Table.Th>
								<Table.Th>Created</Table.Th>
								<Table.Th>Labels</Table.Th>
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{filteredIssues.map((issue) => (
								<Table.Tr key={issue.id}>
									<Table.Td>
										<Anchor
											href={`https://github.com/${report.repoUrl.replace("https://github.com/", "")}/issues/${issue.number}`}
											target="_blank"
										>
											{issue.title}
										</Anchor>
									</Table.Td>
									<Table.Td>{issue.relevanceScore}</Table.Td>
									<Table.Td>{issue.explanation}</Table.Td>
									<Table.Td>
										{new Date(
											issue.createdAt,
										).toLocaleDateString()}
									</Table.Td>
									<Table.Td>
										{issue.labels.join(", ")}
									</Table.Td>
								</Table.Tr>
							))}
						</Table.Tbody>
					</Table>
				</ScrollArea>
			</div>
		</>
	);
}
