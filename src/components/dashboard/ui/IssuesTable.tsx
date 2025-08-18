// src/components/dashboard/ui/IssuesTable.tsx

import type { Id } from "@convex/_generated/dataModel";

import { useQuery } from "convex/react";

import { api } from "@convex/_generated/api";
import {
	Anchor,
	Badge,
	Group,
	HoverCard,
	Mark,
	ScrollArea,
	Stack,
	Table,
	Text,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";

function highlight(text: string, terms: string[]) {
	if (!text || terms.length === 0) return text;
	const escaped = terms
		.filter(Boolean)
		.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	if (escaped.length === 0) return text;

	const re = new RegExp(`(${escaped.join("|")})`, "ig");
	const parts = text.split(re);

	return parts.map((part, i) =>
		re.test(part) ? (
			<Mark key={i} data-term={part.toLowerCase()}>
				{part}
			</Mark>
		) : (
			<span key={i}>{part}</span>
		),
	);
}

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

	// ====== MOBILE (cards) ======
	return (
		<>
			<div className="space-y-3 md:hidden">
				{filteredIssues.map((issue) => {
					const repoPath = report.repoUrl.replace(
						"https://github.com/",
						"",
					);
					const terms = issue.matchedTerms ?? [];
					const proofs = (issue.evidence ?? []).slice(0, 3);

					return (
						<div
							key={issue.id}
							className="rounded-md border border-neutral-600 p-4"
						>
							<h3 className="text-sm font-bold break-words">
								{issue.title}
							</h3>

							<div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
								<span>Relevance:</span>
								<span className="font-semibold text-white">
									{issue.relevanceScore}/100
								</span>
								<span className="text-neutral-500">•</span>
								<span>
									{new Date(
										issue.createdAt,
									).toLocaleDateString()}
								</span>
							</div>

							<p className="mt-2 text-xs text-neutral-300">
								{issue.explanation}
							</p>

							{/* matched terms (chips) */}
							{terms.length > 0 && (
								<div className="mt-2 flex flex-wrap gap-6">
									<div className="text-[11px] text-neutral-400">
										Terms:
									</div>
									<div className="flex flex-wrap gap-6">
										{terms.slice(0, 6).map((t, idx) => (
											<Badge
												key={idx}
												variant="light"
												size="xs"
											>
												{t}
											</Badge>
										))}
									</div>
								</div>
							)}

							{/* evidence list */}
							{proofs.length > 0 && (
								<div className="mt-2">
									<div className="mb-1 text-[11px] text-neutral-400">
										Evidence:
									</div>
									<ul className="list-disc pl-4">
										{proofs.map((ev, idx) => (
											<li
												key={idx}
												className="text-xs text-neutral-300"
											>
												{highlight(ev, terms)}
											</li>
										))}
									</ul>
								</div>
							)}

							<div className="mt-2">
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
								href={`https://github.com/${repoPath}/issues/${issue.number}`}
								target="_blank"
								className="mt-2 block text-xs text-blue-500 underline"
							>
								View Issue →
							</Anchor>
						</div>
					);
				})}
			</div>

			{/* ====== DESKTOP (table) ====== */}
			<div className="hidden md:block">
				<ScrollArea>
					<Table highlightOnHover className="min-w-[800px]">
						<Table.Thead>
							<Table.Tr>
								<Table.Th style={{ width: "36%" }}>
									Title
								</Table.Th>
								<Table.Th style={{ width: "9%" }}>
									<Group gap={6} align="center">
										<span>Score</span>
										<HoverCard
											shadow="md"
											openDelay={150}
											closeDelay={80}
										>
											<HoverCard.Target>
												<IconInfoCircle
													size={16}
													style={{
														opacity: 0.7,
														cursor: "help",
													}}
													aria-label="How this score was computed"
													title="Why?"
												/>
											</HoverCard.Target>
											<HoverCard.Dropdown>
												<Text size="xs" c="dimmed">
													Hover a score to see matched
													terms & evidence.
												</Text>
											</HoverCard.Dropdown>
										</HoverCard>
									</Group>
								</Table.Th>
								<Table.Th style={{ width: "28%" }}>
									Explanation
								</Table.Th>
								<Table.Th style={{ width: "12%" }}>
									Created
								</Table.Th>
								<Table.Th style={{ width: "15%" }}>
									Labels
								</Table.Th>
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{filteredIssues.map((issue) => {
								const repoPath = report.repoUrl.replace(
									"https://github.com/",
									"",
								);
								const terms = issue.matchedTerms ?? [];
								const proofs = (issue.evidence ?? []).slice(
									0,
									3,
								);

								return (
									<Table.Tr key={issue.id}>
										<Table.Td>
											<Anchor
												href={`https://github.com/${repoPath}/issues/${issue.number}`}
												target="_blank"
											>
												{issue.title}
											</Anchor>
										</Table.Td>

										{/* SCORE + hover detail */}
										<Table.Td>
											<HoverCard
												shadow="md"
												openDelay={120}
												closeDelay={80}
												withArrow
											>
												<HoverCard.Target>
													<Text
														fw={600}
														style={{
															cursor: "help",
														}}
													>
														{issue.relevanceScore}
													</Text>
												</HoverCard.Target>
												<HoverCard.Dropdown>
													<Stack gap="xs">
														<Text
															size="xs"
															c="dimmed"
														>
															Why this score:
														</Text>
														{terms.length > 0 ? (
															<Group gap={6}>
																{terms
																	.slice(0, 6)
																	.map(
																		(
																			t,
																			idx,
																		) => (
																			<Badge
																				key={
																					idx
																				}
																				size="xs"
																				variant="light"
																			>
																				{
																					t
																				}
																			</Badge>
																		),
																	)}
															</Group>
														) : (
															<Text size="xs">
																No matched terms
															</Text>
														)}
														{proofs.length > 0 ? (
															<Stack gap={4}>
																{proofs.map(
																	(
																		ev,
																		idx,
																	) => (
																		<Text
																			key={
																				idx
																			}
																			size="xs"
																		>
																			{highlight(
																				ev,
																				terms,
																			)}
																		</Text>
																	),
																)}
															</Stack>
														) : (
															<Text size="xs">
																No evidence
																extracted
															</Text>
														)}
													</Stack>
												</HoverCard.Dropdown>
											</HoverCard>
										</Table.Td>

										<Table.Td>
											<Text size="sm">
												{issue.explanation}
											</Text>
										</Table.Td>

										<Table.Td>
											{new Date(
												issue.createdAt,
											).toLocaleDateString()}
										</Table.Td>

										<Table.Td>
											<Group gap={6} wrap="wrap">
												{issue.labels.map((label) => (
													<Badge
														key={label}
														size="sm"
														variant="outline"
													>
														{label}
													</Badge>
												))}
											</Group>
										</Table.Td>
									</Table.Tr>
								);
							})}
						</Table.Tbody>
					</Table>
				</ScrollArea>
			</div>
		</>
	);
}
