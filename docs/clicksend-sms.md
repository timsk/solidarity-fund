# ClickSend SMS Configuration

Transactional SMS notifications are sent using [ClickSend](https://www.clicksend.com/).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMS_ENABLED` | No | `false` | Toggle SMS on/off |
| `CLICKSEND_USERNAME` | If enabled | — | ClickSend account username |
| `CLICKSEND_API_KEY` | If enabled | — | ClickSend REST API key |
| `SMS_LOG_LEVEL` | No | `warn` | Verbosity: `silent`, `warn`, `info`, `debug` |
| `EMAIL_ENABLED` | No | `false` | Master switch for email notifications |
| `GMAIL_USER` | If email enabled | — | Gmail address used as SMTP sender |
| `GMAIL_APP_PASSWORD` | If email enabled | — | Gmail app password (not the account password) |
| `EMAIL_FROM_NAME` | No | `GMAIL_USER` | Display name on outgoing emails |

When `EMAIL_ENABLED=true` **and** the applicant provided an email address during submission, email is the preferred notification channel. SMS is used only as a fallback for applicants who didn't provide an email.

## First-time setup

1. Sign up for a ClickSend account at https://www.clicksend.com/
2. Generate a **REST API key** in the dashboard
3. On the server, set `CLICKSEND_USERNAME` and `CLICKSEND_API_KEY` in `/var/lib/csf/.env`
4. Set `SMS_ENABLED=true` in the same file
5. Restart the container: `cd /var/lib/csf && docker compose restart`

## Opt-in

SMS is disabled by default (`SMS_ENABLED=false`). This keeps local development and CI clean and avoids accidental costs.

## What gets sent

Both channels fire on the same domain events. Email sends rich HTML to the applicant's provided email address; SMS sends plain text to their phone.

| Event | SMS | Email |
|-------|-----|-------|
| `ApplicationSubmitted` | "Your application has been received." | Welcome message with next steps |
| `ApplicationAccepted` | "Your application has been accepted." | Approval notice with details |
| `ApplicationRejected` | "Your application could not be approved: {reason}." | Rejection notice including reason |
| `ApplicationSelected` | "Your application has been selected in the lottery." | Lottery selection confirmation |
| `GrantPaid` | "Your grant has been paid." | Payment confirmation |

Intermediate operational events (volunteer assigned, proof of address approved, etc.) do **not** trigger any notification.

## Troubleshooting

Check logs via the `/logs` admin page. Look for lines prefixed with `[sms]`.

| Log level | What you see |
|----------|-------------|
| `info` | Every send attempt and result |
| `warn` | Failures and skips only |
| `debug` | Not yet implemented |
| `silent` | Nothing |

If the ClickSend API is down, the sender logs the error and continues. Failed deliveries remain in the outbox for review via the `/outbox` admin page (status filter, manual delete).

## Architecture notes

Outbox pattern: domain events write to the `outbox_messages` table. A backend sender loop drains pending messages every few seconds via a `ChannelSender` registry (currently email + SMS). SMS is best-effort — failures are logged and surfaced in the `/outbox` admin page but never block the domain.
