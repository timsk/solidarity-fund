# Replacement Selection Plan

**Goal**: When a grant slot is released (`SlotReleased` event), automatically promote the next-ranked applicant from the lottery's `notSelected` list for that `monthCycle`.

**Current State**: `SlotReleased` is a terminal event. It frees a slot, marks the grant as `released`, and stops. The `notSelected` list from the `LotteryDrawn` event is never consulted again.

## Architecture

### Stream IDs

| Domain | Pattern |
|--------|---------|
| Application | `application-{applicationId}` |
| Lottery | `lottery-{monthCycle}` |
| Grant | `grant-{applicationId}` |

### Key Insight

After a `SlotReleased` fires for `monthCycle`:
1. Read `lottery-{monthCycle}` stream → get `notSelected` array (preserved shuffle order)
2. Find the first `notSelected` applicant whose application is still in `not_selected` state
3. Emit `SelectApplication` on that application's stream
4. Existing `processApplicationSelected` then auto-creates the grant

### Constraint: Application State Guard

`decideSelect` currently only allows `accepted` or `confirmed` states. After receiving `ApplicationNotSelected`, the application is in `not_selected` state. We must modify the guard to also accept `not_selected`.

## TODOs

- [x] **T1**: Modify `application/decider.ts` `decideSelect` to allow `not_selected` state
  - File: `src/domain/application/decider.ts` (line 214)
  - Change: Add `"not_selected"` to the allowed states in the guard
  - Effect: `SelectApplication` command can now be called on previously not-selected applications (replacement only)
  - Acceptance Criteria:
    - [ ] `decideSelect` accepts state `not_selected` in addition to `accepted` and `confirmed`
    - [ ] All other guards unchanged
    - [ ] Existing tests pass (`bun test` on application decider)

- [x] **T2**: Add `processSlotReleased` function to `grant/processManager.ts`
  - File: `src/domain/grant/processManager.ts`
  - Add: New exported function `processSlotReleased(event: SlotReleased, eventStore, pool?)` 
  - Logic:
    1. Read `lottery-{monthCycle}` stream via `eventStore.readStream()`
    2. Find `LotteryDrawn` event → extract `notSelected` array
    3. Iterate `notSelected` in order (shuffle order preserved)
    4. For each candidate, read `application-{candidate.applicationId}` stream
    5. Find `ApplicationSelected` event on candidate's stream — if found → skip (already promoted)
    6. If candidate is still `not_selected` → emit `SelectApplication` via `CommandHandler` + `decide`
    7. Then call existing `processApplicationSelected` to create grant
    8. Stop after first successful promotion (one slot = one replacement)
    9. If no eligible candidates → nothing happens (slot remains unused)
  - Acceptance Criteria:
    - [ ] Compiles without errors
    - [ ] Reads lottery stream by monthCycle from SlotReleased event data
    - [ ] Iterates notSelected array, skips already-selected candidates
    - [ ] Promotes exactly one replacement per call
    - [ ] No-ops gracefully when notSelected is empty or all candidates are taken
    - [ ] Calls `processApplicationSelected` to create replacement grant

- [x] **T3**: Wire `processSlotReleased` into `grants.ts` route handler
  - File: `src/web/routes/grants.ts`
  - Modify: `handleRelease` (line 151) — call `processSlotReleased` after `releaseSlot` succeeds
  - Modify: `handleDeclineCash` (line 119) — call `processSlotReleased` after `declineCashAlternative` succeeds
  - Both calls should be fire-and-forget (don't block the UI response, or handle errors gracefully)
  - Acceptance Criteria:
    - [ ] `handleRelease` calls `processSlotReleased` after committing release
    - [ ] `handleDeclineCash` calls `processSlotReleased` after committing decline
    - [ ] Route handler doesn't break/error if replacement fails
    - [ ] Typechecks (`bun run typecheck`)

- [x] **T4**: Full verification
  - [x] `bun test` all tests pass (636 pass, 0 fail)
  - [x] LSP diagnostics clean on all changed files
  - [x] Biome formatted 
  - [x] Manual code review of all 4 changed files

## Final Verification Wave

- [x] **F1**: Oracle review — APPROVE. Logic correct, edge cases handled, state machine consistent
- [x] **F2**: TypeScript review — APPROVE. No unsafe casts, no `as any`, no unused imports
- [x] **F3**: Hands-on QA — APPROVE. Build + tests verified clean
- [x] **F4**: Final build + test — APPROVE. 636 pass, 0 fail, biome + LSP clean
