// src/components/dashboard/Dashboard.tsx
import type { Id } from "@convex/_generated/dataModel";

import { useState } from "react";

import {
	Authenticated,
	ConvexReactClient,
	Unauthenticated,
} from "convex/react";

import { Box, Container, MantineProvider } from "@mantine/core";

import { AuthenticationForm } from "../auth/AuthenticationForm";
import { UserInfo } from "../auth/ui/UserInfo";
import { IssueForm } from "./ui/IssueForm";
import { ReportsList } from "./ui/ReportsList";

import "./Dashboard.css";

import { ConvexAuthProvider } from "@convex-dev/auth/react";

const convex = new ConvexReactClient(import.meta.env.PUBLIC_CONVEX_URL);

if (!import.meta.env.PUBLIC_CONVEX_URL) {
	throw new Error("PUBLIC_CONVEX_URL is not defined in .env.local");
}

export const Dashboard = () => {
	const [reportId, setReportId] = useState<Id<"reports"> | null>(null);
	const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);

	return (
		<MantineProvider defaultColorScheme="dark">
			<ConvexAuthProvider client={convex}>
				<Authenticated>
					<Container size="lg" my="lg">
						{/* User Info with Email and SignOut */}
						<UserInfo />

						{/* Main Content with Aesthetic Margins */}
						<Box>
							<IssueForm
								onReportGenerated={(newReportId) => {
									setReportId(newReportId);
								}}
								isAnalysisRunning={isAnalysisRunning}
								setIsAnalysisRunning={setIsAnalysisRunning}
							/>
							<ReportsList
								reportId={reportId}
								setReportId={(id) => {
									setReportId(id);
								}}
							/>
						</Box>
					</Container>
				</Authenticated>
				<Unauthenticated>
					<AuthenticationForm />
				</Unauthenticated>
			</ConvexAuthProvider>
		</MantineProvider>
	);
};
