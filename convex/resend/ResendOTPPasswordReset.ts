// convex/resend/ResendOTPPasswordReset.ts
import { customAlphabet } from "nanoid";
import { Resend as ResendAPI } from "resend";

import { Email } from "@convex-dev/auth/providers/Email";

import { PasswordResetEmail } from "../../src/components/dashboard/template/PasswordResetEmail";

export const ResendOTPPasswordReset = Email({
	id: "resend-otp-password-reset",
	apiKey: process.env.RESEND_API_KEY,
	async generateVerificationToken() {
		const nanoid = customAlphabet("0123456789", 6);
		const token = nanoid();
		return token;
	},
	async sendVerificationRequest({
		identifier: email,
		provider,
		token,
		expires,
	}) {
		const minutesUntilExpiry = Math.floor(
			(+expires - Date.now()) / (60 * 1000),
		);
		const resend = new ResendAPI(provider.apiKey);
		const { error } = await resend.emails.send({
			from: "GitHub Issue Watcher <account@giw.rokimiftah.id>",
			to: [email],
			subject: "Reset Your Password for GIW",
			react: PasswordResetEmail({
				code: token,
				expires,
				minutesUntilExpiry,
			}),
		});
		if (error) {
			throw new Error(`Could not send email: ${error.message}`);
		}
	},
});
