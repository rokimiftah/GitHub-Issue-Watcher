// src/components/auth/ui/UserInfo.tsx
import { Group } from "@mantine/core";

import { SignOut } from "./SignOut";

export function UserInfo() {
	return (
		<Group justify="end" mb="lg">
			<SignOut />
		</Group>
	);
}
