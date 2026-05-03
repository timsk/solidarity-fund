# Volunteer User Guide

This guide covers everything volunteers need to operate the grant lottery system from creating a lottery to completing grants.

---

## Table of Contents

1. [Initial Login](#1-initial-login)
2. [Managing Volunteers](#2-managing-volunteers)
3. [Creating the Lottery](#3-creating-the-lottery)
4. [Reviewing Applications](#4-reviewing-applications)
5. [Closing the Lottery & Drawing Winners](#5-closing-the-lottery--drawing-winners)
6. [Grant Workflow — Bank Transfer](#6-grant-workflow--bank-transfer)
7. [Grant Workflow — Cash Handover](#7-grant-workflow--cash-handover)
8. [Handling Unresponsive Winners](#8-handling-unresponsive-winners)
9. [Managing Applicants](#9-managing-applicants)
10. [Admin Tools](#10-admin-tools)
11. [Key Rules Reference](#11-key-rules-reference)

---

## 1. Initial Login

### First-Time Login

1. Navigate to the application URL
2. You will be redirected to `/login`
3. Enter your **name** and **password** (provided by an admin)
4. If your account requires a password reset, you will be redirected to `/change-password` automatically
5. Set a new password (minimum 12 characters) and submit
6. All other active sessions for your account are invalidated — you stay logged in, but any other devices are logged out
7. You are now logged in and redirected to the dashboard

### Subsequent Logins

1. Go to `/login`
2. Enter your name and password
3. You are redirected to the dashboard

> **Rate limiting:** Login is limited to 10 attempts per 15 minutes per IP address. After exceeding this limit, you'll see a "Too Many Requests" error — wait 15 minutes before trying again.

> **Disabled accounts:** If your account has been disabled by an admin, login returns "This account has been disabled" and you cannot proceed. Contact another admin to re-enable your account.

### Logout

Click **Logout** in the navigation. Your session is cleared immediately.

---

## 2. Managing Volunteers

> **Admin only.** Only volunteers with admin status can manage volunteer accounts.

### Creating a New Volunteer

1. Go to **Volunteers** in the navigation
2. Click **New Volunteer**
3. Fill in:
   - Name (required)
   - Email
   - Phone
   - Password (the volunteer must change this on first login)
4. Submit — the account is created with `requiresPasswordReset` enabled, so the volunteer will be prompted to set their own password on first login

### Editing a Volunteer

1. Go to **Volunteers**
2. Click the volunteer's name
3. Update their details and save

### Disabling / Enabling a Volunteer

- **Disable**: Go to **Volunteers** → click the volunteer → click **Disable**. The volunteer cannot log in while disabled.
- **Enable**: Go to **Volunteers** → click the volunteer → click **Enable**.

### Viewing Volunteer History

Go to **Volunteers** → click the volunteer → click **History** to see their activity log.

---

## 3. Creating the Lottery

Lotteries are created on-demand. Only one lottery can be open at a time.

1. Go to **Lottery** in the navigation
2. If no lottery is open, a creation form appears with:
   - **Lottery name** (text, e.g. "May 2026 Fundraiser") — required
   - **Expected close date** (datetime-local input, pre-filled with last day of current month at 23:59)
3. Click **Open Applications** — the lottery opens and applicants can submit via `/apply`
4. A countdown timer is displayed on the `/apply` page showing time remaining until the expected close date
5. Auto-close fires at the expected close date (lazy check on form visit + cron safety net). Volunteers can also close manually beforehand.

> **What happens when the lottery opens:** The system begins accepting applications. Applications submitted before the lottery opens are automatically rejected with the reason _window closed_.

### How Applicants Apply

Applicants submit via the public form at `/apply`. Required fields are marked with asterisks. The form collects:

- **Name*** (required)
- **Email*** (required)
- **Phone number*** (required — used for identity resolution and contacting winners)
- **Meeting place or address*** (required — used to arrange cash handovers)
- **Payment preference*** — bank transfer or cash
  - If bank: **sort code*** (6 digits, format `XX-XX-XX`) and **account number*** (8 digits) are required, and applicants can optionally upload a **proof of address** document (JPEG, PNG, GIF, WebP, or PDF, max 5MB) to speed up verification later

After submitting, applicants see a confirmation page with their application reference number and outcome (accepted, flagged for review, or rejected with reason).

If the lottery is closed, the form displays a _window closed_ message and no application is submitted.

### Checking Application Status

Applicants can check their own progress at `/status` using the 8-character reference number shown on their confirmation page. The reference is the first 8 characters of the application UUID (hexadecimal). The status page shows a timeline of their application, and if they were selected, the current state of their grant (e.g. awaiting POA review, payment pending). No login is required — the reference number is the only credential needed.

> **Rate limit:** Status lookups are limited to 30 requests per minute per IP address.

---

## 4. Reviewing Applications

### Viewing All Applications

Go to **Applications** to see all applications. You can filter by:
- **Lottery** — select the relevant lottery
- **Status** — e.g. accepted, flagged, rejected, selected
- **Payment preference** — bank or cash

### Application Statuses

| Status | Meaning |
|--------|---------|
| `accepted` | Eligible; in the lottery pool |
| `flagged` | Needs volunteer review (identity mismatch) |
| `rejected` | Ineligible (see reason) |
| `selected` | Won the lottery |
| `not_selected` | Did not win this month |

### Reviewing Flagged Applications

A flagged application means the phone number is already known but the name submitted does not match the existing record. This requires a volunteer to confirm or reject the identity.

1. Go to **Applications** and filter by status **flagged**
2. Click the application to open it
3. Review the submitted name vs. the existing name on record
4. **Confirm** — the application proceeds to eligibility check and, if eligible, enters the lottery pool
5. **Reject** — the application is rejected with reason _identity mismatch_

> The applicant is automatically notified that a volunteer will contact them when their application is flagged.

### Reverting a Review Decision

If you confirmed or rejected a flagged application in error, you can revert your decision:

1. Open the application
2. Click **Revert Decision**
3. Confirm the revert in the dialog
4. The application returns to `flagged` status for re-review

### Rejection Reasons

| Reason | Explanation |
|--------|-------------|
| `window_closed` | Application submitted outside the open window |
| `cooldown` | Applicant received a grant too recently (default: 90 days, configurable via `COOLDOWN_DAYS`) |
| `duplicate` | Applicant already applied this month |
| `identity_mismatch` | Volunteer rejected the flagged identity review |

---

## 5. Closing the Lottery & Drawing Winners

### Closing the Application Window

When the application period ends:

1. Go to **Lottery**
2. Click **Close Application Window**
3. No new applications are accepted from this point

### Drawing the Lottery

After closing the window:

1. Go to **Lottery**
2. Click **Draw Lottery**
3. Enter:
   - **Fund balance** — the total available funds (in pence or £, as displayed)
   - **Reserve amount** — the amount to keep in reserve (not distributed)
   - **Grant amount** — default £40
4. The system calculates: `slots = floor((balance − reserve) ÷ grantAmount)`
5. Click **Draw** — winners are selected using an auditable, seeded random draw
6. Winners are ranked (rank 1 = first priority, rank 2 = first on waitlist, etc.)
7. Grants are automatically created for all selected winners

> **Auditable draw:** The RNG seed is deterministic and stored, so the draw can be verified independently.

> After the draw, all accepted applications are marked either `selected` or `not_selected`.

### Canceling an Active Lottery

If you need to cancel a lottery that is currently open:

1. Go to **Lottery** while the lottery is open
2. Click **Cancel Lottery** (red button)
3. Inline confirmation appears: "This will delete all applications!"
4. Click **Cancel Lottery** again to confirm, or **Keep** to abort
5. All accepted, flagged, and confirmed applications are cancelled; applicants are notified

### Starting a New Lottery After Draw or Cancel

After a lottery is drawn or cancelled, the **Lottery** page shows the "Open Applications" form again:

1. Enter a **lottery name** and **expected close date**
2. Click **Open Applications**
3. The new lottery is now open for applications

---

## 6. Grant Workflow — Bank Transfer

Applicants who chose **bank transfer** as their payment preference go through this workflow.

### Overview

```
Grant created (awaiting_review) → Volunteer verifies POA → Payment recorded → Complete
```

Bank details (sort code, account number, proof of address) are collected at application time. All bank grants start at `awaiting_review` and require a volunteer to verify the POA document before payment.

### Step 1: Assign Yourself to the Grant

1. Go to **Grants** and filter by the current month
2. Find an unassigned grant (bank transfer) in the **Awaiting Review** column
3. Click the grant
4. Click **Assign to me** — you are now responsible for this grant

### Step 2: Verify Proof of Address

1. Go to the grant
2. The grant panel shows the applicant's **sort code** and **account number** for reference
3. Click **View Document** to open the uploaded proof of address
4. Review the document:
   - **Approve** — POA passes due diligence; grant moves to `poa_approved`
   - **Reject** — POA fails; the grant stays in `awaiting_review`. Contact the applicant directly to collect corrected details, then update the bank details using **Edit Bank Details**

> If bank details need correcting, use the **Edit Bank Details** form in the grant panel to update the sort code and/or account number before re-approving.

> After **3 rejections**, the system automatically offers the applicant a cash alternative. See [Cash Alternative](#cash-alternative) below.

### Step 3: Record Payment

Once POA is approved, the grant panel shows the sort code and account number to use:

1. Make the £40 bank transfer to the applicant's account
2. Return to the grant
3. Click **Record Payment**
4. The grant is now **complete** (`paid`)

### Grant Notes

Each grant detail panel includes a **Notes** textarea. Use this to record context about the applicant, payment issues, or any other information. Notes auto-save when you click away from the field.

### Cash Alternative

If an applicant's POA is rejected 3 times, they are offered cash instead:

- If the applicant **accepts**: the grant moves to the cash handover workflow (see [Section 7](#7-grant-workflow--cash-handover))
- If the applicant **declines**: the slot is **released** and becomes available for the next person on the waitlist

---

## 7. Grant Workflow — Cash Handover

Applicants who chose **cash** as their payment preference, or who accepted a cash alternative after failed POA verification.

### Overview

```
Grant created → Assign volunteer → Arrange meeting → Hand over cash
→ Record payment → Submit expense reference → Complete
```

### Step 1: Assign Yourself to the Grant

1. Go to **Grants**
2. Find the cash grant (status: `awaiting_cash_handover`)
3. Click **Assign to me**

### Step 2: Arrange the Meeting

Contact the applicant using their phone number to arrange an in-person cash handover at the location they specified in their application.

### Step 3: Hand Over Cash & Record Payment

After handing over £40 in cash:

1. Go to the grant
2. Click **Record Payment**
3. The grant moves to `awaiting_reimbursement`

### Step 4: Submit Expense Reference

To complete the reimbursement audit trail:

1. Submit an expense claim through the fund's expense process
2. Once you have the expense reference number, return to the grant
3. Click **Record Reimbursement**
4. Enter the expense reference
5. The grant is now **complete** (`reimbursed`)

---

## 8. Handling Unresponsive Winners

If a winner does not respond after being notified:

- Reminder attempted at 7 days
- If a winner is unresponsive after 7 days, the volunteer may manually release the slot. There is no fixed timeline — release whenever the grant cannot proceed.

### Releasing a Slot

1. Go to the grant
2. Click **Release Slot**
3. The slot is released and can be offered to the next person on the waitlist (ranked by lottery order)

> **Waitlist promotion is automated.** When a slot is released, the system automatically promotes the next ranked `not_selected` applicant and creates a grant for them. No manual contact needed.

---

## 9. Managing Applicants

### Viewing Applicants

Go to **Applicants** to browse all known applicant profiles.

### Creating an Applicant Manually

If you need to add someone who cannot use the online form:

1. Go to **Applicants** → **New Applicant**
2. Enter their phone number, name, and optionally email
3. Save — the profile is created and can be referenced in future applications

### Editing an Applicant

1. Go to **Applicants** → click the applicant
2. Update their phone, name, or email
3. Add **notes** (e.g. context about their situation) — notes auto-save when you click away from the textarea
4. Save

### Viewing Applicant History

1. Go to **Applicants** → click the applicant → **History**
2. This shows all applications submitted by this applicant, including outcomes and grant results

### Deleting an Applicant

Deleting an applicant soft-deletes them from the system. Their event history is retained for audit purposes but they are removed from the active applicant list.

> **Data retention:** Applicant data is scheduled for auto-deletion after 6 months of inactivity, in line with the fund's data policy (not yet automated).

---

## 10. Admin Tools

> **Admin only.** The following tools are only visible and accessible to volunteers with admin status.

### Outbox

The Outbox (`/outbox`) shows all queued messages from the outbox pattern:

1. Go to **Outbox** in the navigation
2. Filter by status: **All**, **Pending**, **Sending**, **Sent**, **Failed** (tab-based)
3. Messages show color-coded status badges
4. Paginated (25 per page)
5. **Delete** individual messages or **bulk delete** selected messages

Use for: monitoring failed email/SMS, clearing old queued messages.

### Event Log

The Event Log (`/logs`) provides a paginated audit trail of all domain events in the system — applications submitted, grants created, payments recorded, volunteers managed, etc.

1. Go to **Event Log** in the navigation
2. Events are listed newest-first, 25 per page
3. Each entry shows: event sequence number, relative time ("3 hours ago"), event type (color-coded badge), and a human-readable description with volunteer names

Use this for debugging, auditing, or understanding the system's activity history.

### Database Download

Admins can download a snapshot of the SQLite database for backup or offline analysis:

1. Go to **Download DB** in the navigation
2. A `.sqlite` file is downloaded with the filename `solidarity-fund-YYYY-MM-DD.sqlite`
3. This is a read-only snapshot — the download does not lock or interrupt the live database

### ALTCHA Captcha

The public application form at `/apply` is protected by an ALTCHA captcha widget to prevent bot submissions. No volunteer action is needed — the captcha challenge is served automatically and verified on form submission. The `ALTCHA_HMAC_KEY` environment variable must be set for this to work (configured automatically during installation).

### Security Features

The system includes several security measures that operate transparently:

- **Login rate limiting**: 10 attempts per 15 minutes per IP address
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Content-Security-Policy` are set on all responses
- **Session cookies**: HttpOnly, SameSite=Strict, and Secure (when HTTPS is enabled via the `SECURE_COOKIES` variable)
- **HTTPS/TLS**: The server supports native TLS when `TLS_CERT` and `TLS_KEY` environment variables are set, with automatic HTTP→HTTPS redirect on port 80

---

## 11. Key Rules Reference

| Rule | Detail |
|------|--------|
| **Grant amount** | £40 per grant |
| **Cooldown** | Configurable period (default: 90 days, set via `COOLDOWN_DAYS` env var) — e.g. selected 1 Jan → can reapply from 1 Apr |
| **Duplicate applications** | One application per person per open lottery |
| **Application window** | Volunteer creates a named lottery with an expected close date; one lottery open at a time |
| **Slot calculation** | `floor((fund balance − reserve) ÷ £40)` |
| **POA attempts** | Maximum 3 — after 3 rejections, cash is offered automatically |
| **Unresponsive winners** | Reminder attempted at 7 days; volunteer releases slot manually when applicant is unresponsive or declines cash. No fixed deadline. |
| **Cash reimbursement** | Volunteers who pay cash must record an expense reference to complete the grant |
| **Waitlist** | Winners are ranked — lower-ranked selections serve as the waitlist if slots are released |

---

## Lottery Workflow Checklist

```
[ ] Create a lottery with name and expected close date
[ ] Monitor flagged applications — review and confirm/reject identity
[ ] Close the lottery (manual or auto-close)
[ ] Enter fund balance, reserve, and grant amount
[ ] Draw the lottery
[ ] Assign yourself to grants
[ ] For bank grants: verify POA, record payment
[ ] For cash grants: arrange meeting, record payment, record reimbursement
[ ] Release slots for unresponsive winners or declined cash alternatives
[ ] Waitlist promotion is automated
```
