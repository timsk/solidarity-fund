# Solidarity Fund

A grant lottery system for distributing on-demand grant lotteries to people in need. Applications are collected during a limited window, then winners are drawn when volunteers close the lottery.

## How it works

1. People apply via SMS, email, or web form during an open lottery window
2. Identity is resolved against known applicants by phone number
3. Eligibility is checked (3-month cooldown, no duplicate applications)
4. Eligible applicants enter the lottery pool
5. When the lottery closes, winners are drawn based on available funds
6. Winners receive grants via bank transfer or cash

## Architecture

Event-sourced using [Emmett](https://event-driven-io.github.io/emmett/) with SQLite.

```
Form data
  |
  v
submitApplication()          -- application service (orchestrates I/O)
  |
  |-- resolveIdentity()      -- queries known_applicants projection
  |-- decide()               -- pure decider, no I/O
  |-- CommandHandler          -- persists events to event store
  |
  v
Events --> Projections       -- inline projections update read models
  |
  v
Outbox                       -- idempotent message delivery queue
  |-- emailSender            -- Gmail SMTP (preferred delivery)
  |-- SMSSender              -- Twilio fallback
```

### Domain (`src/domain/application/`)

| File | Role |
|------|------|
| `submitApplication.ts` | Application service. Single entry point for the submission flow |
| `decider.ts` | Pure decider. Command + state in, events out |
| `resolveIdentity.ts` | Queries the `known_applicants` read model by phone number |
| `normalizeName.ts` | Strips diacritics, normalizes whitespace and casing for name comparison |
| `types.ts` | Commands, events, state, and value objects |

### Infrastructure (`src/infrastructure/`)

| File | Role |
|------|------|
| `eventStore.ts` | Creates the SQLite event store with inline projections |
| `projections/eligibility.ts` | Tracks accepted applications per lottery name |
| `projections/knownApplicants.ts` | Maps phone numbers to applicant IDs and names |

### Identity resolution

When an application is submitted, the phone number is looked up against known applicants:

- **No match** -- new applicant, assigned `applicant-{phone}` as ID
- **Phone + name match** -- linked to existing applicant
- **Phone matches, name differs** -- flagged for volunteer review, eligibility deferred

### Event flow

```
SubmitApplication (command)
  |
  +--> ApplicationSubmitted        (always emitted)
  |
  +--> ApplicationAccepted         (eligible, identity resolved)
  |  or ApplicationRejected        (cooldown / duplicate)
  |  or ApplicationFlaggedForReview (name mismatch on known phone)
```

## Running

```sh
bun install
bun test
```

## Deploying

Requires a VPS with SSH access. Docker and dependencies are installed automatically.

### First install

```sh
./install.sh root@your-server
```

Secrets (`ADMIN_PASSWORD`, `ALTCHA_HMAC_KEY`) are auto-generated and saved to `/var/lib/csf/.env` on the server. **Save them** — they're only printed once.

### Upgrading

Push to `main` — the CI pipeline builds and publishes a new Docker image to GHCR. Then:

```sh
./install.sh root@your-server
```

It pulls the latest image and restarts the container. Existing secrets and database are preserved.

### Override defaults

```sh
PORT=443 FUND_NAME="Mutual Aid Fund" ./install.sh root@your-server
```

| Variable | Default | Notes |
|----------|---------|-------|
| `APP_NAME` | `csf` | Container and directory name |
| `DATA_DIR` | `/var/lib/$APP_NAME` | Persistent data (DB, .env) |
| `PORT` | `443` | Host port (Caddy serves HTTPS) |
| `FUND_NAME` | `Community Solidarity Fund` | Displayed in the UI |
| `ADMIN_PASSWORD` | auto-generated | Only used on first boot if no admin exists |
| `ALTCHA_HMAC_KEY` | auto-generated | Required every boot — preserved across upgrades |
| `EMAIL_ENABLED` | `false` | Set to `true` to enable email delivery of lottery results |
| `GMAIL_USER` | — | Gmail address for SMTP sending (required if EMAIL_ENABLED=true) |
| `GMAIL_APP_PASSWORD` | — | Gmail app password for SMTP auth (required if EMAIL_ENABLED=true) |
| `EMAIL_FROM_NAME` | `Solidarity Fund` | Display name for the From field on notification emails |

### What lives where

- **`/var/lib/csf/csf.db`** — SQLite database (bind-mounted, survives upgrades)
- **`/var/lib/csf/.env`** — Secrets and config (preserved across upgrades)
- **`/var/lib/csf/docker-compose.yml`** — Compose file (overwritten each deploy)

## Docs

- [Full workflow and state machines](docs/workflow.md)
- [Volunteer-friendly proposal](docs/proposal.md)
