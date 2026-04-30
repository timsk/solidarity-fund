import type { AnyEvent, ReadEvent } from "@event-driven-io/emmett";
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { OutboxChannel } from "../outbox/types.ts";
import { getEmailTemplate, getTemplateVariables } from "./templates.ts";

export interface EmailNotification {
	channel: OutboxChannel;
	recipient: string;
	subject: string;
	body: string;
}

async function getApplicantEmail(
	pool: ReturnType<typeof SQLiteConnectionPool>,
	applicantId: string,
): Promise<string | null> {
	return pool.withConnection(async (conn) => {
		const row = await conn.querySingle<{ email: string }>(
			"SELECT email FROM applicants WHERE id = ?",
			[applicantId],
		);
		return row?.email ?? null;
	});
}

export async function renderEmailNotification(
	event: ReadEvent<AnyEvent>,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<EmailNotification | null> {
	const template = getEmailTemplate(event.type);
	if (!template) return null;

	const vars = getTemplateVariables(event);
	if (!vars) return null;

	let email: string | null = null;
	if (
		event.type === "ApplicationSubmitted" &&
		"identity" in event.data &&
		event.data.identity
	) {
		email = (event.data.identity as { email?: string }).email ?? null;
	} else if ("applicantId" in event.data) {
		email = await getApplicantEmail(pool, event.data.applicantId as string);
	}

	if (!email) return null;

	const { subject, html } = template(vars);

	return { channel: "email", recipient: email, subject, body: html };
}
