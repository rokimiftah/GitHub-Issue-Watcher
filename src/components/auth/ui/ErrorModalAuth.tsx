// src/components/auth/ui/ErrorModalAuth.tsx

import { useEffect } from "react";

import { Alert, Modal } from "@mantine/core";

interface ErrorModalProps {
	error: string | null;
	onClose: () => void;
}

export const ErrorModalAuth = ({ error, onClose }: ErrorModalProps) => {
	useEffect(() => {
		if (error) {
			const timer = setTimeout(() => {
				onClose();
			}, 3000);
			return () => clearTimeout(timer);
		}
	}, [error, onClose]);

	return (
		<Modal opened={!!error} onClose={onClose} withCloseButton={false}>
			<Alert
				color="red"
				styles={{
					root: {
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						textAlign: "center",
						padding: "3px",
					},
					icon: {
						marginTop: "13px",
						marginBottom: "10px",
					},
					message: {
						marginTop: "10px",
						marginBottom: "10px",
						fontSize: "16px",
					},
				}}
			>
				{error}
			</Alert>
		</Modal>
	);
};
