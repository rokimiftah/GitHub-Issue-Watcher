// src/components/dashboard/Dashboard.tsx
import type { Id } from "@convex/_generated/dataModel";

import { useState } from "react";

import {
	Authenticated,
	ConvexReactClient,
	Unauthenticated,
} from "convex/react";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { Container, Group, MantineProvider, Title } from "@mantine/core";

import { AuthenticationForm } from "../auth/AuthenticationForm";
import { UserInfo } from "../auth/ui/UserInfo";
import { IssueFormModal } from "./ui/IssueFormModal";
import { ReportsList } from "./ui/ReportsList";

import "./Dashboard.css";

const convex = new ConvexReactClient(import.meta.env.PUBLIC_CONVEX_URL);

if (!import.meta.env.PUBLIC_CONVEX_URL) {
	throw new Error("PUBLIC_CONVEX_URL is not defined in .env.local");
}

export const Dashboard = () => {
	const [reportId, setReportId] = useState<Id<"reports"> | null>(null);

	return (
		<MantineProvider defaultColorScheme="dark">
			<ConvexAuthProvider client={convex}>
				<Authenticated>
					<Container size="2xl" my="lg">
						<UserInfo />
					</Container>
					<Container size="lg" my="70">
						<Group
							justify="center"
							align="center"
							mb="lg"
							className="sm:justify-between"
						>
							<Title order={2}>GitHub Issue Reports</Title>
							<IssueFormModal onReportGenerated={setReportId} />
						</Group>

						<ReportsList
							reportId={reportId}
							setReportId={setReportId}
						/>
					</Container>
				</Authenticated>
				<Unauthenticated>
					<AuthenticationForm />
				</Unauthenticated>
			</ConvexAuthProvider>
		</MantineProvider>
	);
};
