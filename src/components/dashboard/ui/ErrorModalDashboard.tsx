// src/components/dashboard/ui/ErrorModalDashboard.tsx

import { Button, Modal, Text } from "@mantine/core";

export interface ErrorModalProps {
	opened: boolean;
	onClose: () => void;
	errorMessage: string;
}

export function ErrorModalDashboard({
	opened,
	onClose,
	errorMessage,
}: ErrorModalProps) {
	return (
		<Modal opened={opened} onClose={onClose} title="Error" centered>
			<Text>{errorMessage}</Text>
			<Button onClick={onClose} mt="md">
				Close
			</Button>
		</Modal>
	);
}
