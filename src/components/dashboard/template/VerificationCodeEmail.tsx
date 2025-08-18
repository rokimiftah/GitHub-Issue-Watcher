// convex/resend/template/VerificationCodeEmail.tsx

import {
	Body,
	Container,
	Head,
	Heading,
	Html,
	Section,
	Text,
} from "@react-email/components";

interface VerificationCodeEmailProps {
	code: string;
	expires: Date;
	minutesUntilExpiry: number;
}

export function VerificationCodeEmail({
	code,
	minutesUntilExpiry,
}: VerificationCodeEmailProps) {
	return (
		<Html>
			<Head />
			<Body style={main}>
				<Container style={container}>
					<Section style={contentSection}>
						<Heading style={h1}>Verify Your Email Address</Heading>
						<Text style={mainText}>
							Thanks for starting the new GIW account creation
							process. We want to make sure it's really you.
							Please enter the following verification code when
							prompted. If you don&apos;t want to create an
							account, you can ignore this message.
						</Text>
						<Section style={verificationSection}>
							<Text style={verifyText}>
								Your Verification Code
							</Text>
							<Text style={codeText}>{code}</Text>
							<Text style={validityText}>
								This code expires in {minutesUntilExpiry}{" "}
								minutes.
							</Text>
						</Section>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

const main = {
	backgroundColor: "#f4f7fa",
	fontFamily:
		"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Helvetica Neue', sans-serif",
	color: "#1a202c",
};

const container = {
	maxWidth: "600px",
	width: "100%",
	margin: "0 auto",
	backgroundColor: "#ffffff",
	borderRadius: "8px",
	overflow: "hidden",
	boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
};

const contentSection = {
	padding: "40px 30px",
	backgroundColor: "#ffffff",
};

const h1 = {
	color: "#1a202c",
	fontSize: "24px",
	fontWeight: 600,
	margin: "0 0 20px",
	textAlign: "center" as const,
};

const mainText = {
	color: "#4a5568",
	fontSize: "16px",
	lineHeight: "24px",
	margin: "0 0 20px",
	textAlign: "center" as const,
};

const verificationSection = {
	backgroundColor: "#f7fafc",
	borderRadius: "8px",
	padding: "20px",
	margin: "20px 0",
	textAlign: "center" as const,
};

const verifyText = {
	color: "#2d3748",
	fontSize: "14px",
	fontWeight: 600,
	margin: "0 0 10px",
};

const codeText = {
	color: "#4a90e2",
	fontSize: "32px",
	fontWeight: 700,
	letterSpacing: "4px",
	margin: "10px 0",
	textAlign: "center" as const,
};

const validityText = {
	color: "#718096",
	fontSize: "14px",
	margin: "0",
};
