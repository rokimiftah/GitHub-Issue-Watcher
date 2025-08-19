// src/components/dashboard/ui/IssueFormModal.tsx

import type { Id } from "@convex/_generated/dataModel";

import { useState } from "react";

import { useQuery } from "convex/react";

import { api } from "@convex/_generated/api";
import {
	Alert,
	Button,
	Center,
	Loader,
	LoadingOverlay,
	Modal,
	Text,
} from "@mantine/core";

import { IssueForm } from "./IssueForm";

interface IssueFormModalProps {
	onReportGenerated: (reportId: Id<"reports">) => void;
}

const MAX_ACTIVE_REPORTS = 3;

export function IssueFormModal({ onReportGenerated }: IssueFormModalProps) {
	const [opened, setOpened] = useState(false);
	const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);

	// GANTI: dari checkIncompleteReport → getWorkloadStatus
	const workload = useQuery(api.githubIssues.getWorkloadStatus) ?? {
		openReports: 0,
		queued: 0,
		running: 0,
	};
	const { openReports, queued, running } = workload;
	const atLimit = openReports >= MAX_ACTIVE_REPORTS;

	return (
		<>
			<Button
				onClick={() => setOpened(true)}
				disabled={
					atLimit /* ← TIDAK lagi disable hanya karena ada proses */
				}
				className="bg-[#f5d90a] text-[#111110] transition-all duration-200 hover:bg-[#f5d90ae6]"
			>
				{atLimit
					? `Limit reached (${openReports}/${MAX_ACTIVE_REPORTS})`
					: "Create New Report"}
			</Button>

			<Modal
				opened={opened}
				onClose={() => !isAnalysisRunning && setOpened(false)}
				title="Generate GitHub Issue Report"
				size="lg"
				centered
				closeOnClickOutside={!isAnalysisRunning}
				closeOnEscape={!isAnalysisRunning}
				withCloseButton={false}
				overlayProps={{ backgroundOpacity: 0.7, blur: 5 }}
				styles={{
					content: {
						border: "1px solid #4a4a4a",
						position: "relative",
					},
					title: { textAlign: "center", width: "100%" },
				}}
			>
				<LoadingOverlay
					visible={isAnalysisRunning}
					overlayProps={{ blur: 10 }}
					loaderProps={{
						children: (
							<Center
								style={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: "10px",
									minHeight: "100%",
									marginTop: "40px",
								}}
							>
								<Loader color="blue" size="sm" type="dots" />
								<Text c="blue" size="sm" ta="center">
									Processing batch... Partial report will be
									emailed soon.
								</Text>
							</Center>
						),
					}}
				/>

				{/* Info ringan status aktif, tanpa memblokir */}
				<Alert color="gray" mb="md" variant="light" ta="center">
					Active reports: <b>{openReports}</b> • Tasks:{" "}
					<b>{queued}</b> queued / <b>{running}</b> running. Limit:{" "}
					{MAX_ACTIVE_REPORTS}.
				</Alert>

				{atLimit && (
					<Alert color="yellow" mb="md">
						You already have {openReports} active report(s).
						Close/finish one to start another, or increase the
						limit.
					</Alert>
				)}

				<IssueForm
					onReportGenerated={(reportId) => {
						setOpened(false);
						onReportGenerated(reportId);
					}}
					isAnalysisRunning={isAnalysisRunning}
					setIsAnalysisRunning={setIsAnalysisRunning}
					disabled={
						atLimit /* hanya diblokir saat benar-benar mencapai limit */
					}
				/>
			</Modal>
		</>
	);
}
