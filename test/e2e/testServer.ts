import {
	changePassword,
	createVolunteer,
} from "../../src/domain/volunteer/commandHandlers.ts";
import { SQLiteApplicantRepository } from "../../src/infrastructure/applicant/sqliteApplicantRepository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { initOutboxSchema } from "../../src/infrastructure/outbox/schema.ts";
import { SQLiteSessionStore } from "../../src/infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerCredentialsStore } from "../../src/infrastructure/volunteer/sqliteVolunteerCredentialsStore.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { startServer } from "../../src/web/server.ts";

const port = Number(process.env.TEST_PORT ?? 3001);

process.env.ALTCHA_HMAC_KEY = process.env.ALTCHA_HMAC_KEY ?? "test-hmac-key";

const { store: eventStore, pool } = createEventStore("file::memory:?cache=shared");
const sessionStore = await SQLiteSessionStore(pool);
const volunteerRepo = await SQLiteVolunteerRepository(pool);
const applicantRepo = await SQLiteApplicantRepository(pool);
const credentialsStore = await SQLiteVolunteerCredentialsStore(pool);

await pool.withConnection(async (conn) => {
	await initOutboxSchema(conn);

	const seedMessages = [
		["Alice Seed", "07700900101"],
		["Bob Seed", "07700900102"],
		["Carol Seed", "07700900103"],
		["Dave Seed", "07700900104"],
	] as const;

	for (let i = 0; i < seedMessages.length; i++) {
		const [name, recipient] = seedMessages[i];
		await conn.command(
			`INSERT INTO outbox_messages (event_stream, event_position, event_type, channel, recipient, body, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ? || ' seconds'))`,
			[
				`test-seed-${i}`,
				i,
				"ApplicationSubmitted",
				"sms",
				recipient,
				`Test outbox message for ${name}`,
				"pending",
				String(-(seedMessages.length - i) * 60),
			],
		);
	}
});

const { id } = await createVolunteer(
	{ name: "Test", password: "test", isAdmin: true },
	eventStore,
	credentialsStore,
);
await changePassword(id, "test", eventStore, credentialsStore);

const server = await startServer(
	sessionStore,
	volunteerRepo,
	applicantRepo,
	eventStore,
	pool,
	":memory:",
	port,
);

console.log(`TEST_SERVER_READY:${server.port}`);
