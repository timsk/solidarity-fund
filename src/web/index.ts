import { setFundName } from "../config.ts";
import { createVolunteer } from "../domain/volunteer/commandHandlers.ts";
import { SQLiteApplicantRepository } from "../infrastructure/applicant/sqliteApplicantRepository.ts";
import { createEmailClient } from "../infrastructure/email/client.ts";
import { createEventStore } from "../infrastructure/eventStore.ts";
import { buildChannelSenders } from "../infrastructure/outbox/channelSenders.ts";
import { startOutboxSenderLoop } from "../infrastructure/outbox/sender.ts";
import { createOutboxStore } from "../infrastructure/outbox/store.ts";
import { SQLiteSessionStore } from "../infrastructure/session/sqliteSessionStore.ts";
import { createSmsClient } from "../infrastructure/sms/client.ts";
import { SQLiteVolunteerCredentialsStore } from "../infrastructure/volunteer/sqliteVolunteerCredentialsStore.ts";
import { SQLiteVolunteerRepository } from "../infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { startEventSubscriptions } from "../subscriptions.ts";
import { startServer } from "./server.ts";

const dbPath = process.env.DB_PATH ?? "csf.db";
const fundName = process.env.FUND_NAME ?? "Community Solidarity Fund";
setFundName(fundName);

const { store: eventStore, pool } = createEventStore(dbPath);
const sessionStore = await SQLiteSessionStore(pool);
const volunteerRepo = await SQLiteVolunteerRepository(pool);
const applicantRepo = await SQLiteApplicantRepository(pool);
const credentialsStore = await SQLiteVolunteerCredentialsStore(pool);

startEventSubscriptions(eventStore, pool).catch(console.error);

// Start the outbox sender loop (drains outbox_messages and delivers SMS)
const outboxStore = createOutboxStore(pool);
const smsClient = createSmsClient();
const emailClient = createEmailClient();
const senders = buildChannelSenders(smsClient, emailClient);
const senderLoop = startOutboxSenderLoop({ store: outboxStore, pool, senders });

const admins = await volunteerRepo.getAdmins();
if (admins.length === 0) {
	const adminPassword = process.env.ADMIN_PASSWORD;
	if (!adminPassword) {
		throw new Error(
			"ADMIN_PASSWORD environment variable is required when no admin account exists",
		);
	}
	await createVolunteer(
		{ name: "admin", password: adminPassword, isAdmin: true },
		eventStore,
		credentialsStore,
	);
	console.log("No admin found — created default account (name: admin).");
}

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const httpPort = process.env.HTTP_PORT ? Number(process.env.HTTP_PORT) : 80;
const tlsCert = process.env.TLS_CERT;
const tlsKey = process.env.TLS_KEY;
const server = await startServer(
	sessionStore,
	volunteerRepo,
	applicantRepo,
	eventStore,
	pool,
	dbPath,
	port,
	tlsCert,
	tlsKey,
);

if (tlsCert && tlsKey && httpPort) {
	Bun.serve({
		port: httpPort,
		fetch(req) {
			const url = new URL(req.url);
			url.protocol = "https:";
			url.port = String(port);
			return Response.redirect(url.toString(), 301);
		},
	});
	console.log(`HTTP→HTTPS redirect on port ${httpPort}`);
}

const scheme = tlsCert && tlsKey ? "https" : "http";
console.log(
	`${fundName} server running at ${scheme}://localhost:${server.port}`,
);

// Clean shutdown signals are handled by the Docker platform (SIGTERM → container restart)
// The sender loop auto-recovers on restart since outbox is idempotent
