// src/components/auth/ui/PasswordStrength.tsx

import { useMemo } from "react";

import { Card, Center, Group, Progress, Text } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";

interface PasswordRequirementProps {
	meets: boolean;
	label: string;
}

function PasswordRequirement({ meets, label }: PasswordRequirementProps) {
	return (
		<Text component="div" c={meets ? "teal" : "red"} mt={5} size="sm">
			<Center inline>
				{meets ? (
					<IconCheck size={14} stroke={1.5} />
				) : (
					<IconX size={14} stroke={1.5} />
				)}
				<Text ml={7}>{label}</Text>
			</Center>
		</Text>
	);
}

const requirements = [
	{ re: /[0-9]/, label: "Includes number" },
	{ re: /[a-z]/, label: "Includes lowercase letter" },
	{ re: /[A-Z]/, label: "Includes uppercase letter" },
	{ re: /[$&+,:;=?@#|'<>.^*()%!-]/, label: "Includes special symbol" },
];

function getStrength(password: string) {
	let multiplier = password.length > 5 ? 0 : 1;
	requirements.forEach((requirement) => {
		if (!requirement.re.test(password)) {
			multiplier += 1;
		}
	});
	return Math.max(100 - (100 / (requirements.length + 1)) * multiplier, 0);
}

interface PasswordStrengthProps {
	password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
	const strength = getStrength(password);
	const checks = useMemo(
		() =>
			requirements.map((requirement, index) => (
				<PasswordRequirement
					key={index}
					label={requirement.label}
					meets={requirement.re.test(password)}
				/>
			)),
		[password],
	);

	const bars = useMemo(
		() =>
			Array(4)
				.fill(0)
				.map((_, index) => (
					<Progress
						styles={{ section: { transitionDuration: "0ms" } }}
						value={
							password.length > 0 && index === 0
								? 100
								: strength >= ((index + 1) / 4) * 100
									? 100
									: 0
						}
						color={
							strength > 80
								? "teal"
								: strength > 50
									? "yellow"
									: "red"
						}
						key={index}
						size={4}
					/>
				)),
		[password, strength],
	);

	return (
		<Card mt="15" radius="md">
			<Group gap="5" grow mt="6" mb="10">
				{bars}
			</Group>
			<PasswordRequirement
				label="Has at least 6 characters"
				meets={password.length > 5}
			/>
			{checks}
		</Card>
	);
}
