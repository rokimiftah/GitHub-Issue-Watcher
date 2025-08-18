// src/components/dashboard/ui/IssueForm.tsx

import type { Id } from "@convex/_generated/dataModel";

import { useState } from "react";

import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";

import { api } from "@convex/_generated/api";
import { Button, Group, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";

interface IssueFormProps {
	onReportGenerated: (reportId: Id<"reports">) => void;
	isAnalysisRunning: boolean;
	setIsAnalysisRunning: (isRunning: boolean) => void;
	disabled?: boolean;
}

export function IssueForm({
	onReportGenerated,
	isAnalysisRunning,
	setIsAnalysisRunning,
	disabled = false,
}: IssueFormProps) {
	const storeIssues = useAction(api.githubIssues.storeIssues);
	const currentUser = useQuery(api.users.getCurrentUser);
	const [error, setError] = useState<string | null>(null);

	const form = useForm({
		initialValues: { repoUrl: "", keyword: "" },
		validate: {
			repoUrl: (value) =>
				/^https:\/\/github.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(
					value,
				)
					? null
					: "Invalid GitHub repository URL",
			keyword: (value) =>
				value.length > 0 ? null : "Keyword is required",
		},
	});

	const handleSubmit = async (values: typeof form.values) => {
		if (!currentUser?.email) {
			setError("User email not found. Please log in again.");
			return;
		}
		setIsAnalysisRunning(true);
		setError(null);
		try {
			const newReportId = await storeIssues({
				repoUrl: values.repoUrl,
				keyword: values.keyword.toLowerCase(),
				userEmail: currentUser.email,
			});
			onReportGenerated(newReportId as Id<"reports">);
			form.reset();
		} catch (error) {
			if (
				error instanceof ConvexError &&
				error.data.includes("GitHub authentication failed")
			) {
				setError(
					"GitHub authentication failed. Please contact the administrator to verify the GITHUB_TOKEN.",
				);
			} else {
				setError(
					error instanceof ConvexError
						? error.data
						: "An unexpected error occurred",
				);
			}
		} finally {
			setIsAnalysisRunning(false);
		}
	};

	return (
		<div className="space-y-4">
			<Text size="sm" c="dimmed" mb="md">
				Enter a GitHub repository URL and a keyword to generate an issue
				report.
			</Text>
			{error && (
				<Text c="red" mb="md" size="sm">
					{error}
				</Text>
			)}
			<form onSubmit={form.onSubmit(handleSubmit)} className="space-y-4">
				<TextInput
					label="GitHub Repository URL"
					placeholder="https://github.com/owner/repo"
					{...form.getInputProps("repoUrl")}
					className="w-full"
					disabled={isAnalysisRunning}
				/>
				<TextInput
					label="Keyword"
					placeholder="e.g., authentication"
					{...form.getInputProps("keyword")}
					className="w-full"
					disabled={isAnalysisRunning}
				/>
				<Group justify="flex-end">
					<Button
						type="submit"
						loading={isAnalysisRunning}
						disabled={
							isAnalysisRunning || !currentUser?.email || disabled
						}
						className="bg-[#f5d90a] text-[#111110] transition-all duration-200 hover:bg-[#f5d90ae6]"
					>
						{isAnalysisRunning
							? "Processing..."
							: "Generate Report"}
					</Button>
				</Group>
			</form>
		</div>
	);
}
