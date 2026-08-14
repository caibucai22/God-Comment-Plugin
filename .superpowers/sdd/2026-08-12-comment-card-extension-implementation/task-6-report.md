# Task 6 Report: Theme Tokens and Text Layout Engine

## Implementation

- Added immutable, renderer-ready data tokens for warm, history, sarcasm, and SSS card themes.
- Added a measured text layout engine that preserves paragraph boundaries, wraps CJK/mixed text, keeps English words intact when possible, splits overlong tokens safely, scales down by 2px, and truncates only at the minimum size.
- Added deterministic canvas-measurement tests covering theme decoration, text bounds, CJK, Emoji, long English tokens, scaling, truncation, whitespace, and tiny unsafe bounds.

## TDD Evidence

- RED: `npm test -- --run tests/unit/styles.test.ts tests/unit/text-layout.test.ts` failed because both `src/render/styles.ts` and `src/render/text-layout.ts` were missing.
- GREEN: the same targeted command passed with 13/13 tests after implementation.

## Verification

- `npx tsc --noEmit` — PASS.
- `npm test -- --run tests/unit/styles.test.ts tests/unit/text-layout.test.ts` — PASS (13/13).
- `npm test -- --run` — PASS (50/50).
- `npm run build` — PASS; Vite retains the pre-existing empty `index.ts` chunk warning.
- `git diff --check` — PASS.

## Self-review

- Every theme includes background, border, body/metadata colors, accent, particles, texture, and mark descriptors; game-only badge, energy lines, and extra particles are empty/null when disabled.
- SSS remains restrained without game decoration: obsidian ground, gold-purple fine border, SSS mark, and two sparse star-particle descriptors.
- Each `getStyleTokens` call deep-clones then freezes data, so consumers cannot mutate a shared registry object.
- Text measurement always assigns the requested canvas font before wrapping. No returned non-empty line is wider than its bound.
- Paragraph boundaries become empty layout lines, and tiny width/height bounds terminate without an overflowing ellipsis or loop.

## Independent review

- Read-only review of `7104d6d..c2f2023` found no functional Critical or Important issue in the rendering primitives.
- The reviewer found that this required report was ignored and therefore absent from the feature commit. It is force-added in the follow-up documentation commit.

## Commit

- `c2f2023d82d1059c2e3e5b6b200b7cfc6511ac65` — `feat: add card themes and text layout`.

## Concerns

- `lineHeight` is explicitly a font-size multiplier and the result exposes the resolved pixel height; Task 7 should use that resolved value when positioning text.

## Fix round 1: exact font-size decrement validation

- Root cause: `Math.max(minFontSize, fontSize - 2)` could clamp a final decrement from `14` to an unaligned minimum such as `13`, violating the public 2px decrement invariant.
- RED: the new invalid-range regression failed with `expected function to throw an error, but it didn't`.
- GREEN: `layoutText` now rejects non-finite/non-positive values, inverted ranges, and ranges whose difference is not divisible by two with a clear `RangeError`. Every accepted range can therefore reach its minimum through exact 2px decrements.
- Added an explicit `Intl.Segmenter`-unavailable test. It temporarily replaces and restores the exact `Intl.Segmenter` property descriptor in `try/finally`, so no global state leaks between tests.
- Final verification: targeted layout tests PASS (10/10); full suite PASS (52/52); `npx tsc --noEmit`, `npm run build`, and `git diff --check` PASS. The build retains the pre-existing empty `index.ts` chunk warning.
