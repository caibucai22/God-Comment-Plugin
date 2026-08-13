# Task 4 Report: Comment Selection State Machine

Implementation commit: `bbbb069e9874251197ee09bb4a1402081de1b1c5` (`feat: add comment selection state machine`).

## Files

- Created `src/selection/selection-controller.ts`.
- Created `tests/integration/selection-controller.test.ts`.

## TDD Evidence

- RED: `npm test -- --run tests/integration/selection-controller.test.ts` failed because `../../src/selection/selection-controller` did not exist.
- GREEN: the targeted suite passes with 11 tests, covering activation/state, delegated hover transitions, extracted and null selections, Escape, context menu, outside click, public hint exit, wheel non-exit, root replacement/no scan, absent-root re-observation, and destroy cleanup.

## Implementation

- Provides `SelectionController`, `SelectionExitReason`, and state callback payloads.
- Uses document-capture delegated event listeners and resolves the current comment through `PlatformAdapter` for every relevant event.
- Applies only the temporary `ccg-comment-hover` class to the current resolved comment.
- Observes only the current root's parent with `{ childList: true }`; mutation callbacks are coalesced to one animation frame and compare only root connectivity and adapter root identity.
- Keeps selection mode active while no root is available and keeps observing the last observable parent, without polling.

## Verification

- `npm test -- --run tests/integration/selection-controller.test.ts` — PASS (11/11).
- `npx tsc --noEmit` — PASS.
- `npm test -- --run` — PASS (25/25).
- `npm run build` — PASS. Vite reports the pre-existing empty `index.ts` content-script chunk warning.
- `git diff --check` — PASS.

## Self-review

- Event listeners are added/removed only at selection lifecycle boundaries and are inert after destroy.
- No comment-level listener, comment enumeration, subtree observer, or polling was introduced.
- Root replacement clears hover and rebinds the observer; null extraction cannot call `onSelect`.

## Concerns

- The built extension's current content script remains empty, so this controller is not yet wired to a UI entry point; that integration belongs to later tasks.
