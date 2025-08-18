// convex/resend/ResendOTP.ts

import { customAlphabet } from "nanoid";
import { Resend as ResendAPI } from "resend";

import { Email } from "@convex-dev/auth/providers/Email";

import { VerificationCodeEmail } from "../../src/components/dashboard/template/VerificationCodeEmail";

export const ResendOTP = Email({
	id: "resend-otp",
	apiKey: process.env.RESEND_API_KEY,
	maxAge: 10 * 60, // 10 minutes
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
			subject: "Verify Your Email for GIW",
			react: VerificationCodeEmail({
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
