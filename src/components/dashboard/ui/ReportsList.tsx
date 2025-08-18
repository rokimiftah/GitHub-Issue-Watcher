// src/components/dashboard/ui/ReportsList.tsx

import type { Doc, Id } from "@convex/_generated/dataModel";

import { useQuery } from "convex/react";

import { api } from "@convex/_generated/api";
import { Paper, Select, Text } from "@mantine/core";

import { IssuesTable } from "./IssuesTable";

interface ReportsListProps {
	reportId: Id<"reports"> | null;
	setReportId: (reportId: Id<"reports"> | null) => void;
}

export function ReportsList({ reportId, setReportId }: ReportsListProps) {
	const reports = useQuery(api.githubIssues.getUserReports) as
		| Doc<"reports">[]
		| undefined;
	const selectedReport = useQuery(
		api.githubIssues.getReport,
		reportId ? { reportId } : "skip",
	) as Doc<"reports"> | null;

	return (
		<Paper p="md" mt="md" withBorder className="rounded-md border">
			<Text fw={500} mb="md" ta="center">
				Your Reports
			</Text>
			<Select
				label="Select a Report"
				placeholder="Choose a report to view"
				data={reports?.map((report: Doc<"reports">) => ({
					value: report._id,
					label: `${report.repoUrl} - ${report.keyword.toLowerCase()} (${report.isComplete ? "complete" : "processing"})`,
				}))}
				value={reportId}
				onChange={(value) => setReportId(value as Id<"reports"> | null)}
				clearable
				mb="md"
			/>
			{reportId && selectedReport && (
				<>
					{!selectedReport.isComplete && (
						<Text c="blue" size="sm" mb="md">
							This report is being processed. Check your email for
							partial results.
						</Text>
					)}
					<Text c="dimmed" size="sm">
						Last Fetched:{" "}
						{new Date(selectedReport.lastFetched).toLocaleString()}
					</Text>
					<Text c="dimmed" size="sm">
						Results for this repository and keyword are cached for 1
						hour.
					</Text>
					<Text c="dimmed" size="sm" mb="lg">
						Data will be refreshed automatically after this period
						when you submit the same repository and keyword.
					</Text>
					<IssuesTable reportId={reportId} />
				</>
			)}
		</Paper>
	);
}
