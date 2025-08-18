// src/components/auth/ui/SignOut.tsx

import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@mantine/core";

export function SignOut() {
	const { signOut } = useAuthActions();
	return (
		<Button variant="light" color="red" onClick={() => void signOut()}>
			Sign Out
		</Button>
	);
}
