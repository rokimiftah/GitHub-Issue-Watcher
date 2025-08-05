// src/components/dashboard/ui/IssueFormModal.tsx
import type { Id } from "@convex/_generated/dataModel";

import { useState } from "react";

import { Button, LoadingOverlay, Modal } from "@mantine/core";

import { IssueForm } from "./IssueForm";

interface IssueFormModalProps {
	onReportGenerated: (reportId: Id<"reports">) => void;
}

export function IssueFormModal({ onReportGenerated }: IssueFormModalProps) {
	const [opened, setOpened] = useState(false);
	const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);

	return (
		<>
			<Button
				onClick={() => setOpened(true)}
				className="bg-[#f5d90a] text-[#111110] transition-all duration-200 hover:bg-[#f5d90ae6]"
			>
				Create New Report
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
				overlayProps={{
					backgroundOpacity: 0.7,
					blur: 5,
				}}
				styles={{
					content: {
						border: "1px solid #4a4a4a",
					},
					title: {
						textAlign: "center",
						width: "100%",
					},
				}}
			>
				<LoadingOverlay
					visible={isAnalysisRunning}
					overlayProps={{ blur: 2 }}
				/>
				<IssueForm
					onReportGenerated={(reportId) => {
						setOpened(false);
						onReportGenerated(reportId);
					}}
					isAnalysisRunning={isAnalysisRunning}
					setIsAnalysisRunning={setIsAnalysisRunning}
				/>
			</Modal>
		</>
	);
}
