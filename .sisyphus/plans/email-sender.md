# Email Sender Implementation Plan

## P0 Blocker — Resolved

`Bun.SMTPClient` and `Bun.email()` were unavailable in Bun 1.3.11.
**Resolution**: Upgraded to Bun canary channel.

---

## Requirements

1. Email sender using `Bun.SMTPClient` (native, zero deps)
2. Gmail SMTP with app passwords (`service: "gmail"`, auth with `user` + `pass`)
3. Rich HTML email content (vs SMS plaintext)
4. **Business logic**: If applicant has both email + phone → send email (preferred, no cost). Phone only → SMS. Email only → email.
5. Follow existing patterns: event-sourced, clean architecture, `NullClient` pattern

---

## Architecture

### Pipeline (after changes)
```
Domain event → subscriptions.ts:
  1. renderEmailNotification(event, pool)
     → if applicant has email → record to outbox (channel: "email") → DONE
  2. renderSmsNotification(event, pool)
     → record to outbox (channel: "sms")
       ↓
startOutboxSenderLoop() polls every 5s
  → senders.get(msg.channel)
  → "email" → EmailClient.send({ to, subject, html })
  → "sms"   → SmsClient.send({ to, body })
```

---

## Atomic Commits

| # | Scope |
|---|---|
| 1 | Config + outbox schema/types |
| 2 | Email client + templates + renderer |
| 3 | Subscription logic + boot wiring |
| 4 | Tests |
| 5 | Outbox UI subject column |

---

## Parallel Task Graph

### Wave 0: Unblock Transport

| ID | Task | Files | Category | QA |
|---|---|---|---|---|
| W0.1 | Upgrade Bun to canary, verify `Bun.SMTPClient` exists | — | `deep` | Run `bun -e "console.log(typeof Bun.SMTPClient, typeof Bun.email)"` |

### Wave 1: Foundation (all parallel, no dependencies between tasks)

| ID | Task | Files | Category | QA |
|---|---|---|---|---|
| W1.1 | Add `EmailConfig` with `getEmailConfig()`, `resetEmailConfig()` | `src/config.ts`, `test/unit/config.test.ts` | `quick` | `bun test test/unit/config.test.ts` |
| W1.2 | Extend outbox types: `subject?: string` on `OutboxMessage`, `OutboxMessageInput`, `ChannelSender.send()` | `src/infrastructure/outbox/types.ts` | `quick` | `bun test test/unit/outboxStore.test.ts` |
| W1.3 | Migrate outbox schema: `subject TEXT` column | `src/infrastructure/outbox/schema.ts` | `quick` | `bun test test/unit/outboxStore.test.ts` |
| W1.5 | Create email templates: 6 events (ApplicationSubmitted, ApplicationAccepted, ApplicationRejected, ApplicationSelected, ApplicationNotSelected, GrantPaid) — HTML format | `src/infrastructure/email/templates.ts` | `quick` | Unit test in Wave 4 |

**W1.1 details**: Env vars: `EMAIL_ENABLED`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`. Pattern mirrors `SmsConfig` exactly.
**W1.2 details**: `ChannelSender.send(recipient, body, subject?)` — backwards compatible, optional 3rd param.
**W1.3 details**: `ALTER TABLE outbox_messages ADD COLUMN subject TEXT` with try/catch `duplicate column` guard.

### Wave 2: Core Infrastructure (parallel after W1)

| ID | Task | Files | Category | QA |
|---|---|---|---|---|
| W2.1 | Implement `EmailClient` interface, `SmtpEmailClient` (wraps `Bun.SMTPClient`), `NullEmailClient`, `createEmailClient()` | `src/infrastructure/email/client.ts` | `deep` | `bun test test/unit/email/client.test.ts` (created in Wave 4) |
| W2.2 | Implement `renderEmailNotification()` — looks up applicant email from DB or event identity | `src/infrastructure/email/notificationRenderer.ts` | `quick` | `bun test test/unit/email/notificationRenderer.test.ts` (Wave 4) |
| W2.3 | Register `"email"` channel sender in `buildChannelSenders()`, update SMS adapter for optional `subject` | `src/infrastructure/outbox/channelSenders.ts` | `quick` | Existing outbox tests still pass |

**W2.1 details**: `EmailClient` interface:
```ts
send(params: { to: string; subject: string; html: string; text?: string }): Promise<{ success: boolean; messageId?: string; error?: string }>
```
`SmtpEmailClient` constructor: `new Bun.SMTPClient({ service: "gmail", auth: { user, pass } })`.
`NullEmailClient`: always returns `{ success: true }`.

**W2.2 details**: Lookup logic mirrors `renderSmsNotification`:
- `ApplicationSubmitted` → email from `event.data.identity.email`
- Other events → `SELECT email FROM applicants WHERE id = ?`
- Returns `{ channel: "email", recipient, subject, body }` or `null`

**W2.3 details**: Email adapter: `(recipient, body, subject) => emailClient.send({ to: recipient, subject: subject ?? "", html: body })`

### Wave 3: Subscription Wiring (after W2)

| ID | Task | Files | Category | QA |
|---|---|---|---|---|
| W3.1 | Update `eachMessage` in `startEventSubscriptions()` — email-first with SMS fallback | `src/subscriptions.ts` | `deep` | `bun test test/integration/subscriptionsOutbox.test.ts` (Wave 4) |
| W3.2 | Bootstrap `createEmailClient()` in app startup, pass to `buildChannelSenders()` | `src/web/index.ts` | `quick` | App starts without errors |

**W3.1 logic**:
```ts
// Try email first
const emailNotification = await renderEmailNotification(event, pool);
if (emailNotification) {
    await outboxStore.recordMessage(context.connection, { ...emailNotification, ... });
    return;
}
// Fallback to SMS
const smsNotification = await renderSmsNotification(event, pool);
if (smsNotification) {
    await outboxStore.recordMessage(context.connection, { ...smsNotification, ... });
}
```

### Wave 4: Tests (after W3)

| ID | Task | Files | Category | QA |
|---|---|---|---|---|
| W4.1 | Unit: email config | `test/unit/config.test.ts` | `quick` | Self-verifying |
| W4.2 | Unit: email client | `test/unit/email/client.test.ts` | `quick` | `bun test test/unit/email/client.test.ts` |
| W4.3 | Unit: email notification renderer | `test/unit/email/notificationRenderer.test.ts` | `quick` | `bun test test/unit/email/notificationRenderer.test.ts` |
| W4.4 | Integration: email enqueued by subscriptions | `test/integration/subscriptionsOutbox.test.ts` | `deep` | `bun test test/integration/subscriptionsOutbox.test.ts` |
| W4.5 | Integration: email sender loop dispatches via ChannelSender | `test/integration/outboxSender.test.ts` | `deep` | `bun test test/integration/outboxSender.test.ts` |
| W4.6 | Integration: idempotency (restart does not duplicate email) | `test/integration/subscriptionsOutbox.test.ts` | `deep` | `bun test test/integration/subscriptionsOutbox.test.ts` |

### Wave 5: UI

| ID | Task | Files | Category | QA |
|---|---|---|---|---|
| W5.1 | Display `subject` column in outbox admin page | `src/web/pages/outbox.ts`, `src/web/routes/outbox.ts` | `visual-engineering` | Manual: navigate to /outbox, verify subject renders |

### Wave 6: QA

| ID | Task | Category | QA |
|---|---|---|---|
| W6.1 | Full test suite | `quick` | `bun test` — all pass |
| W6.2 | Lint + format | `quick` | `bunx biome check --write` — clean |
| W6.3 | TypeScript review | `unspecified-high` | Dispatch `typescript-pro` agent |

---

## Exact File Paths

### Created
- `src/infrastructure/email/client.ts`
- `src/infrastructure/email/templates.ts`
- `src/infrastructure/email/notificationRenderer.ts`
- `test/unit/email/client.test.ts`
- `test/unit/email/notificationRenderer.test.ts`

### Modified
- `src/config.ts` — EmailConfig
- `src/infrastructure/outbox/types.ts` — subject on types + ChannelSender
- `src/infrastructure/outbox/schema.ts` — subject column migration
- `src/infrastructure/outbox/channelSenders.ts` — email registration
- `src/subscriptions.ts` — email-first fallback
- `src/web/index.ts` — createEmailClient, pass to buildChannelSenders
- `src/web/pages/outbox.ts` — subject display
- `src/web/routes/outbox.ts` — subject in query
- `test/unit/config.test.ts` — email config tests
- `test/integration/outboxSender.test.ts` — email channel test
- `test/integration/subscriptionsOutbox.test.ts` — email subscription tests

---

## TDD Workflow per Wave

- **W1**: Write config test assertions first (`EMAIL_ENABLED`, `resetEmailConfig()`), then implement.
- **W2**: Write unit tests in W4 first, then implement W2 code against those tests.
- **W3**: Write integration tests in W4 first, then implement W3 logic.
- **W4**: Execute after W2+W3 implementation.
- **W5**: No TDD — UI polish verified manually.
