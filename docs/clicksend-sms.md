# ClickSend SMS Configuration

Transactional SMS notifications are sent using [ClickSend](https://www.clicksend.com/).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMS_ENABLED` | No | `false` | Toggle SMS on/off |
| `CLICKSEND_USERNAME` | If enabled | — | ClickSend account username |
| `CLICKSEND_API_KEY` | If enabled | — | ClickSend REST API key |
| `SMS_LOG_LEVEL` | No | `warn` | Verbosity: `silent`, `warn`, `info`, `debug` |

## First-time setup

1. Sign up for a ClickSend account at https://www.clicksend.com/
2. Generate a **REST API key** in the dashboard
3. On the server, set `CLICKSEND_USERNAME` and `CLICKSEND_API_KEY` in `/var/lib/csf/.env`
4. Set `SMS_ENABLED=true` in the same file
5. Restart the container: `cd /var/lib/csf && docker compose restart`

## Opt-in

SMS is disabled by default (`SMS_ENABLED=false`). This keeps local development and CI clean and avoids accidental costs.

## What gets sent

SMS notifications fire in response to domain events:

- `ApplicationSubmitted` — "Your application has been received."
- `ApplicationAccepted` — "Your application has been accepted."
- `ApplicationRejected` — "Your application could not be approved: {reason}."
- `ApplicationSelected` — "Your application has been selected in the lottery."
- `GrantPaid` — "Your grant has been paid."

Intermediate operational events (volunteer assigned, proof of address approved, etc.) do **not** trigger SMS.

## Troubleshooting

Check logs via the `/logs` admin page. Look for lines prefixed with `[sms]`.

| Log level | What you see |
|----------|-------------|
| `info` | Every send attempt and result |
| `warn` | Failures and skips only |
| `debug` | Not yet implemented |
| `silent` | Nothing |

If the ClickSend API is down, the processor logs the error and continues. Events are durable in the event store, so SMS is a best-effort side effect.

## Architecture notes

The SMS service is an event-driven processor attached to the Emmett SQLite event store. It keeps the domain pure — command handlers never touch SMS directly. The processor starts in `src/web/index.ts` and consumes events via `eventStore.consumer()`.
