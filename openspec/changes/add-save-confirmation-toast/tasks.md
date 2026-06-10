## 1. Toast component
- [x] 1.1 Add a transient toast (`src/dialogs/toast.ts`): a small Lit component (WA design tokens, not a callout — full control of dismiss) appended to a live region in `document.body`, auto-dismissing after ~3s, manually dismissible (close button + click-to-dismiss), region `aria-live="polite"`, toast `role="status"`, reduced-motion-aware. Exposes `showToast({ message, label?, type?, icon?, duration? })` alongside `showAlert`.
- [x] 1.2 Replacement over stacking: a new toast clears any in-flight toast, so held Cmd/Ctrl+S shows one current message.

## 2. Wire into quick-save
- [x] 2.1 `puzzle-screen.ts`: Check-&-Save **success** and **Quick-load** success call `showToast(...)`; the **mistakes-found** path keeps `showAlert(...)` (warning modal). (Quick-load previously showed nothing on success — now a "Quick-save restored" toast.)

## 3. Tests + verify
- [x] 3.1 Component test (happy-dom): `toast.test.ts` — `showToast` mounts into a polite live region, replaces rather than stacks, auto-removes; `puzzle-screen.test.ts` — success path calls `showToast` (not `showAlert`), refusal path calls `showAlert` (not `showToast`).
- [x] 3.2 Dev-server spot-check: a clean Check-&-Save shows a bottom-centre "Checkpoint saved" success toast (non-modal, board still interactive) that auto-dismisses within ~3s; 0 console errors. (Refusal still modal — covered by the wall-mistake verification.)
- [x] 3.3 Pre-commit gate green (tsc, biome, 677 vitest, vite build). Toast is tappable/click-to-dismiss for touch; pointer-events scoped so the non-toast area stays interactive.
