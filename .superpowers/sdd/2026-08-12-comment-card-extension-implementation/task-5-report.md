# Task 5 Report: Shadow DOM Entry, Prompts, and Confirmation Card

## Implementation

- Added `OverlayRoot`, the document-owned Shadow DOM host and typed event boundary.
- Added `createConfirmCard` for the read-only comment preview and generation controls.
- Added isolated overlay styling with the restrained cyan-to-purple-to-pink-to-warm-gold edge, maximum 12px mist, and reduced-motion override.
- Enabled Vitest CSS processing so tests exercise the real imported stylesheet.

## TDD Evidence

- RED: `npm test -- --run tests/integration/overlay-root.test.ts tests/integration/confirm-card.test.ts` failed because `src/ui/overlay-root.ts` did not exist.
- GREEN: after the minimal UI implementation, targeted integration tests pass (9/9).

## Verification

- `npm test -- --run tests/integration/overlay-root.test.ts tests/integration/confirm-card.test.ts` — PASS (9/9).
- `npx tsc --noEmit` — PASS.
- `npm test -- --run` — PASS (35/35).
- `npm run build` — PASS. Vite retains the pre-existing empty `index.ts` chunk warning.
- `git diff --check` — PASS.

## Self-review

- All created UI is appended to one open Shadow Root; no style is inserted into `document.head`.
- `mount()` and `destroy()` are idempotent; public interaction methods and event dispatch are inert after destruction.
- The exact controller-facing events are emitted: `toggle-selection`, `exit-selection`, `confirm-generate` with `{ source, options }`, and `cancel-generate`.
- Cover is forcibly unchecked and disabled when no cover URL exists. Controls use native radios and checkboxes in logical DOM order, with Chinese aria labels.
- No Escape handler or preference persistence was added; both remain outside this task's responsibility.

## Concerns

- This UI is deliberately not wired to `SelectionController` yet; a later integration task owns that lifecycle.
