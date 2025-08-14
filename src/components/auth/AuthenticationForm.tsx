// src/components/auth/AuthenticationForm.tsx
import { useCallback, useState } from "react";

import { ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";
import isEmail from "validator/lib/isEmail";

import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import {
	Anchor,
	Button,
	Center,
	Divider,
	Group,
	Paper,
	PasswordInput,
	Text,
	TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useToggle } from "@mantine/hooks";

import { ErrorModalAuth } from "./ui/ErrorModalAuth";
import { GitHubButton } from "./ui/GitHubButton";
import { PasswordStrength } from "./ui/PasswordStrength";

const convex = new ConvexReactClient(import.meta.env.PUBLIC_CONVEX_URL);

interface AuthFormValues {
	email: string;
	password: string;
	confirmPassword: string;
	code: string;
	newPassword: string;
}

export function AuthenticationForm() {
	const { signIn } = useAuthActions();
	const [type, toggle] = useToggle<
		"signIn" | "signUp" | "verify" | "forgot" | "reset"
	>(["signIn", "signUp", "verify", "forgot", "reset"]);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [email, setEmail] = useState<string | null>(null);

	const form = useForm<AuthFormValues>({
		initialValues: {
			email: "",
			password: "",
			confirmPassword: "",
			code: "",
			newPassword: "",
		},
		validate: {
			email: (value) => (isEmail(value) ? null : "Invalid email address"),
			password: (value) => {
				if (type === "signUp") {
					if (value.length < 6)
						return "Password must be at least 6 characters long";
					if (!/[0-9]/.test(value))
						return "Password must include a number";
					if (!/[a-z]/.test(value))
						return "Password must include a lowercase letter";
					if (!/[A-Z]/.test(value))
						return "Password must include an uppercase letter";
					if (!/[$&+,:;=?@#|'<>.^*()%!-]/.test(value))
						return "Password must include a special symbol";
				}
				if (type === "signIn" && value.length === 0) {
					return "Password cannot be empty";
				}
				return null;
			},
			confirmPassword: (value, values) =>
				type === "signUp" && value !== values.password
					? "Passwords do not match"
					: null,
			code: (value) =>
				(type === "verify" || type === "reset") && value.length !== 6
					? "Verification code must be 6 digits"
					: null,
			newPassword: (value) => {
				if (type === "reset") {
					if (value.length === 0)
						return "New password cannot be empty";
					if (value.length < 6)
						return "New password must be at least 6 characters long";
					if (!/[0-9]/.test(value))
						return "New password must include a number";
					if (!/[a-z]/.test(value))
						return "New password must include a lowercase letter";
					if (!/[A-Z]/.test(value))
						return "New password must include an uppercase letter";
					if (!/[$&+,:;=?@#|'<>.^*()%!-]/.test(value))
						return "New password must include a special symbol";
				}
				return null;
			},
		},
	});

	const handleGitHubLogin = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			await signIn("github", { redirectTo: "/dashboard" });
		} catch (error: unknown) {
			const errorMessage =
				error instanceof ConvexError
					? (error.data as { message: string }).message ||
						"Failed to login with GitHub"
					: "Failed to login with GitHub";
			setError(errorMessage);
			setIsLoading(false);
		}
	}, [signIn]);

	const handleFormSubmit = useCallback(
		async (values: AuthFormValues) => {
			setIsLoading(true);
			setError(null);
			const formData = new FormData();
			const normalizedEmail = values.email.trim().toLowerCase();
			formData.set("email", normalizedEmail);

			try {
				if (
					type === "signIn" ||
					type === "signUp" ||
					type === "forgot"
				) {
					const userExists = await convex.query(
						api.users.checkUserExists,
						{ email: normalizedEmail },
					);

					if (type === "signIn" && !userExists) {
						setIsLoading(false);
						setError("Invalid Email or Password");
						return;
					}

					if (type === "signIn" && userExists) {
						const providers = await convex.query(
							api.users.checkUserProvider,
							{ email: normalizedEmail },
						);
						if (
							providers?.includes("github") &&
							!providers.includes("password")
						) {
							setIsLoading(false);
							setError(
								"You are already registered with GitHub. Please use GitHub to log in.",
							);
							return;
						}
					}

					if (type === "signUp" && userExists) {
						setIsLoading(false);
						setError("Email already registered. Please login");
						return;
					}

					if (type === "forgot" && !userExists) {
						setIsLoading(false);
						setError("No user registered with this email");
						return;
					}
				}

				if (type === "signIn") {
					formData.set("flow", "signIn");
					formData.set("password", values.password);
				} else if (type === "signUp") {
					formData.set("flow", "signUp");
					formData.set("password", values.password);
				} else if (type === "verify") {
					formData.set("flow", "email-verification");
					formData.set("code", values.code);
				} else if (type === "forgot") {
					formData.set("flow", "reset");
				} else if (type === "reset") {
					formData.set("flow", "reset-verification");
					formData.set("code", values.code);
					formData.set("newPassword", values.newPassword);
				}

				const result = await signIn("password", formData);

				if (type === "signIn" && !result.signingIn) {
					const isVerified = await convex.query(
						api.users.getUserVerificationStatus,
						{ email: normalizedEmail },
					);
					if (!isVerified) {
						setEmail(normalizedEmail);
						toggle("verify");
						setError(
							"Email not verified. Please verify your email",
						);
						setIsLoading(false);
						return;
					}
				} else if (type === "signUp" && !result.signingIn) {
					setEmail(normalizedEmail);
					toggle("verify");
				} else if (type === "forgot" && !result.signingIn) {
					setEmail(normalizedEmail);
					toggle("reset");
				} else if (type === "verify" && !result.signingIn) {
					try {
						await convex.mutation(api.users.verifyEmail, {
							email: normalizedEmail,
							code: values.code,
						});
						toggle("signIn");
					} catch (verifyError: unknown) {
						const errorMessage =
							verifyError instanceof ConvexError
								? (verifyError.data as { message: string })
										.message || "Failed to verify email"
								: "Failed to verify email";
						setError(errorMessage);
						setIsLoading(false);
						return;
					}
				} else if (type === "reset" && !result.signingIn) {
					toggle("signIn");
				}
			} catch (error: unknown) {
				let errorMessage: string;
				if (error instanceof ConvexError) {
					const errorData = error.data as { message: string };
					if (
						type === "signIn" &&
						(errorData.message === "Invalid credentials" ||
							errorData.message.includes("Invalid password"))
					) {
						errorMessage = "Invalid Email or Password";
					} else {
						errorMessage =
							errorData.message ||
							(type === "verify"
								? "Invalid or expired verification code"
								: type === "reset"
									? "Invalid or expired reset code"
									: "An unexpected error occurred");
					}
				} else {
					errorMessage =
						type === "signIn"
							? "Invalid Email or Password"
							: type === "verify"
								? "Invalid or expired verification code"
								: type === "reset"
									? "Invalid or expired reset code"
									: "An unexpected error occurred";
				}
				setError(errorMessage);
			} finally {
				setIsLoading(false);
			}
		},
		[signIn, type, toggle],
	);

	const toggleType = useCallback(
		(newType: "signIn" | "signUp" | "forgot") => {
			toggle(newType);
			form.reset();
			setError(null);
			setEmail(null);
		},
		[form, toggle],
	);

	return (
		<Center h="100dvh">
			<Paper
				radius="md"
				p="xl"
				withBorder
				className="w-full max-w-md"
				aria-labelledby="auth-title"
			>
				<Text id="auth-title" size="md" fw={700} ta="center" mb="xl">
					GitHub Issue Watcher
				</Text>

				{(type === "signIn" || type === "signUp") && (
					<>
						<Group grow mb="md" mt="md">
							<GitHubButton
								radius="xl"
								onClick={handleGitHubLogin}
								disabled={isLoading}
							>
								GitHub
							</GitHubButton>
						</Group>
						<Divider
							label="Or continue with email"
							labelPosition="center"
							mt="xl"
							mb="lg"
						/>
					</>
				)}

				<form
					onSubmit={form.onSubmit(handleFormSubmit)}
					aria-disabled={isLoading}
				>
					<fieldset disabled={isLoading}>
						{(type === "signIn" ||
							type === "signUp" ||
							type === "forgot") && (
							<>
								<Group mb="5">
									<Text size="sm" fw={500}>
										Email{" "}
										<span className="text-red-500">*</span>
									</Text>
								</Group>
								<TextInput
									placeholder="your@email.com"
									radius="md"
									aria-label="Email address"
									{...form.getInputProps("email")}
								/>
							</>
						)}

						{(type === "verify" || type === "reset") && email && (
							<>
								<Text ta="center" mb="xl">
									A verification code has been sent to {email}
									.
								</Text>
								<Group mb="5">
									<Text size="sm" fw={500}>
										Verification Code{" "}
										<span className="text-red-500">*</span>
									</Text>
								</Group>
								<TextInput
									placeholder="Enter 6-digit code"
									radius="md"
									aria-label="Verification code"
									{...form.getInputProps("code")}
								/>
							</>
						)}

						{type === "signIn" && (
							<>
								<Group justify="space-between" mb="5" mt="25">
									<Text size="sm" fw={500}>
										Password{" "}
										<span className="text-red-500">*</span>
									</Text>
									<Anchor
										href="#"
										fz="xs"
										fw={500}
										onClick={(event) => {
											event.preventDefault();
											toggleType("forgot");
										}}
										underline="hover"
									>
										Forgot your password?
									</Anchor>
								</Group>
								<PasswordInput
									placeholder="••••••••"
									radius="md"
									aria-label="Password"
									{...form.getInputProps("password")}
								/>
							</>
						)}

						{type === "signUp" && (
							<>
								<Group mb="5" mt="25">
									<Text size="sm" fw={500}>
										Password{" "}
										<span className="text-red-500">*</span>
									</Text>
								</Group>
								<PasswordInput
									placeholder="••••••••"
									radius="md"
									aria-label="Password"
									{...form.getInputProps("password")}
								/>
								<Group mb="5" mt="25">
									<Text size="sm" fw={500}>
										Confirm Password{" "}
										<span className="text-red-500">*</span>
									</Text>
								</Group>
								<PasswordInput
									placeholder="••••••••"
									radius="md"
									aria-label="Confirm password"
									{...form.getInputProps("confirmPassword")}
								/>
								<PasswordStrength
									password={form.values.password}
								/>
							</>
						)}

						{type === "reset" && (
							<>
								<Group mb="5" mt="25">
									<Text size="sm" fw={500}>
										New Password{" "}
										<span className="text-red-500">*</span>
									</Text>
								</Group>
								<PasswordInput
									placeholder="••••••••"
									radius="md"
									aria-label="New password"
									{...form.getInputProps("newPassword")}
								/>
								<PasswordStrength
									password={form.values.newPassword}
								/>
							</>
						)}

						<ErrorModalAuth
							error={error}
							onClose={() => setError(null)}
						/>

						<Group justify="space-between" mt="xl">
							<Anchor
								component="button"
								type="button"
								size="xs"
								underline="hover"
								c="#a3a3a3"
								onClick={() =>
									toggleType(
										type === "signIn"
											? "signUp"
											: type === "forgot" ||
												  type === "verify" ||
												  type === "reset"
												? "signIn"
												: "signIn",
									)
								}
							>
								{type === "signIn"
									? "Don't have an account? Register"
									: type === "signUp"
										? "Already have an account? Login"
										: "Back to Login"}
							</Anchor>
							<Button
								type="submit"
								radius="xl"
								loading={isLoading}
								loaderProps={{ color: "#000000" }}
								className="w-32 bg-[#f5d90a] text-[#111110] transition-all duration-200 hover:bg-[#f5d90ae6]"
							>
								{type === "signIn"
									? "Login"
									: type === "signUp"
										? "Register"
										: type === "forgot"
											? "Forgot"
											: "Continue"}
							</Button>
						</Group>
					</fieldset>
				</form>
			</Paper>
		</Center>
	);
}
