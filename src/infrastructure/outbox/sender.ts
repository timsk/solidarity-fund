import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { createOutboxStore } from "./store.ts";
import type { ChannelSender } from "./types.ts";

const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 10;

export function startOutboxSenderLoop(options: {
	store: ReturnType<typeof createOutboxStore>;
	pool: ReturnType<typeof SQLiteConnectionPool>;
	senders: Map<string, ChannelSender>;
	intervalMs?: number;
	batchSize?: number;
}): { stop: () => void } {
	const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
	const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

	async function processBatch() {
		await options.pool.withConnection(async (conn) => {
			const pending = await options.store.getPendingMessages(conn, batchSize);

			for (const msg of pending) {
				const claimed = await options.store.markSending(conn, msg.id);
				if (!claimed) continue;

				const sender = options.senders.get(msg.channel);
				if (!sender) {
					await options.store.markFailed(
						conn,
						msg.id,
						`No sender for channel: ${msg.channel}`,
					);
					continue;
				}

				try {
					const result = await sender.send(
						msg.recipient,
						msg.body,
						msg.subject,
					);
					if (result.success) {
						await options.store.markSent(conn, msg.id, result.messageId);
					} else {
						await options.store.markFailed(
							conn,
							msg.id,
							result.error ?? "unknown error",
						);
					}
				} catch (err) {
					await options.store.markFailed(
						conn,
						msg.id,
						err instanceof Error ? err.message : String(err),
					);
				}
			}
		});
	}

	const intervalId = setInterval(() => {
		processBatch().catch((err) => {
			console.error("[outbox] sender loop error:", err);
		});
	}, intervalMs);

	processBatch().catch((err) => {
		console.error("[outbox] sender loop initial error:", err);
	});

	return {
		stop: () => clearInterval(intervalId),
	};
}
