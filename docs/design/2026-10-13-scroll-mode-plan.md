# Scroll mode and autoscroll: implementation plan

**Goal:** a Scroll reading mode in the Lectorium with autoscroll paced in words per minute and an optional guide line.

**Architecture:** a `Scroller` beside the `Paginator`, both behind a `ChapterView` interface the `ReadingController` holds; an `Autoscroll` class drives the Scroller frame by frame; the Lectorium switches taps, keys and controls by mode.

**Tech stack:** Svelte 5, TypeScript, Vitest, Playwright (Chromium and WebKit).

**Spec:** [2026-10-13-scroll-mode-design.md](2026-10-13-scroll-mode-design.md)

## Global constraints

- Pace levels: 100, 125, 150, 175, 200, 225, 250, 300, 350, 400 words/min; default 200.
- Speed limits: 0.1 to 3 body lines per second. Ease-in 0.5 s. Hand-scroll resume 1.5 s. Chapter-end wait 1.5 s. Place saved at most once a second while scrolling.
- Scroll column at most 36em wide, centred. Guide line at one third of the page height.
- Pages mode unchanged: every existing test stays green unedited.
- Same sandbox and CSP for the chapter frame; no new runtime dependency.
- UI copy in English. Commits in the repo's sentence style, no attribution.
- Node runs with `NODE_OPTIONS=--max-old-space-size=2048`.

## Review focus

1. A chapter that is only a picture (cover, title page): speed must stay within the limits and autoscroll must still reach its end and cross over. Test in Task 4.
2. Rotation or a text size change mid-autoscroll: the place holds and the pace in words/min stays. Test in Task 3 (resize keeps place) and Task 5 (size change).
3. Switching to Pages while playing: autoscroll stops and nothing keeps moving the old view. Test in Task 5.
4. Leaving the Lectorium or closing the book while playing: the animation loop and wake lock are released. Test in Task 4 (destroy stops the loop).
5. The last chapter: autoscroll stops at the end of the book, with "End of the book" shown. Test in Task 4.

---

### Task 1: Settings

**Files:** modify `src/rooms/archivum/index.ts`; test `tests/unit/rooms/archivum.test.ts`.

**Produces:** `Settings` gains `mode: ReadingMode` (`'pages' | 'scroll'`, exported type), `pace: number`, `guideLine: boolean`. `DEFAULT_SETTINGS = { fontSizePercent: 100, theme: 'light', mode: 'pages', pace: 200, guideLine: false }`. Imports `PACES` from `src/reader/autoscroll.ts` (Task 2), so Task 2's constants come first in the same commit if needed.

- [ ] Update the two default-settings expectations to the new shape; add `it('keeps the reading mode, a pace from the levels and the guide line switch')`: `mode: 'scroll'` kept, `mode: 'columns'` ignored; `pace: 210` snaps to 200, `pace: 1000` to 400, `pace: 'x'` ignored; `guideLine: true` kept, `guideLine: 'yes'` ignored; a stored `{ fontSizePercent: 120 }` without the new fields loads with their defaults.
- [ ] Run `npx vitest run tests/unit/rooms/archivum.test.ts`: fails.
- [ ] Implement in `merge`: pace snaps to the nearest level.
- [ ] Run again: passes.

### Task 2: Pace functions

**Files:** create `src/reader/autoscroll.ts` (pure part); test `tests/unit/reader/autoscroll.test.ts`.

**Produces:**
- `PACES: readonly number[]` (the ten levels), `DEFAULT_PACE = 200`.
- `snapPace(value: number): number` nearest level.
- `stepPace(pace: number, step: 1 | -1): number` neighbouring level, clamped at the ends.
- `countWords(text: string): number` = `max(runs of non-space characters, ceil(non-space characters / 6))`.
- `pixelsPerSecond(pace: number, height: number, words: number, lineHeight: number): number` = `pace / 60 * height / max(1, words)`, clamped to `[0.1 * lineHeight, 3 * lineHeight]`.

- [ ] Tests: `snapPace(210) === 200`, `snapPace(0) === 100`, `snapPace(999) === 400`; `stepPace(400, 1) === 400`, `stepPace(250, 1) === 300`, `stepPace(100, -1) === 100`; `countWords('one two  three') === 3`, `countWords('一二三四五六七八九十一二') === 2`, `countWords('') === 0`; `pixelsPerSecond(240, 1000, 100, 30) === 40`; `pixelsPerSecond(400, 20000, 5, 30) === 90` (picture chapter, upper limit); `pixelsPerSecond(100, 100, 10000, 30) === 3` (lower limit).
- [ ] Run `npx vitest run tests/unit/reader/autoscroll.test.ts`: fails; implement; passes.
- [ ] Commit Tasks 1 and 2 together.

### Task 3: Scroller

**Files:** create `src/reader/scroller.ts`; modify `src/reader/paginator.ts` (export `ChapterView`, `settle`, `srcdocLoaded`, the link selector and helpers the Scroller shares; Paginator `implements ChapterView`); modify `tests/harness/lectorium.ts`; test `tests/e2e/scroller.spec.ts`.

**Consumes:** `countWords`, `pixelsPerSecond` (Task 2).

**Produces:**
- `interface ChapterView { readonly page: number; readonly pageCount: number; show(srcdoc, target): Promise<void>; next(): boolean; prev(): boolean; fraction(): number; destroy(): void }`.
- `interface ScrollerEvents { onInternalLink(key: string): void; onHandScroll(): void; onEdge(direction: 'prev' | 'next'): void }`.
- `class Scroller implements ChapterView` with `constructor(host: HTMLElement, events: ScrollerEvents)`, `advance(px: number): boolean` (false once the bottom is on screen), `speedFor(pace: number): number`, `setEdges(hasPrev: boolean, hasNext: boolean): void` (labels "Previous chapter", "Next chapter" or "End of the book").
- Hand scroll detection: a scroll event whose `scrollTop` differs from the last value the Scroller set by more than 1 px counts as a hand scroll; it updates the anchor and calls `onHandScroll`.
- The Scroller restores the host's previous `overflow` and removes its column on `destroy`.

- [ ] Harness: `lectorium.start(keep, mode)` and `lectorium.setMode(mode)` (Task 4 adds `setMode` to the controller; until then build the view directly in a scroller-only harness entry `lectorium.scroller`). Tests in `scroller.spec.ts`, Chromium and WebKit:
  - `shows a whole chapter as one column that scrolls`: frame height equals the chapter's height and the host's `scrollHeight` exceeds its `clientHeight`; no horizontal overflow at 360 px.
  - `opens at a fraction and reports it back`: show at 0.5, `fraction()` within 0.01 of 0.5.
  - `scrolls by one screen less two lines`: `next()` moves `scrollTop` by `clientHeight - 2 * lineHeight` (±2 px); `prev()` at the top returns false.
  - `keeps its place when the width changes`: as the paginator test, narrow and widen three times, the same paragraph is at the top.
  - `follows a link deep in the chapter`.
  - `reports a hand scroll but not its own moves`: `advance(50)` does not call `onHandScroll`; `mouse.wheel` does.
  - `advance stops at the bottom`.
- [ ] Run `npx playwright test tests/e2e/scroller.spec.ts`: fails; implement; passes; run `tests/e2e/paginator.spec.ts` and `lectorium.spec.ts`: unchanged and green.
- [ ] Commit.

### Task 4: Controller and Autoscroll

**Files:** modify `src/rooms/lectorium/controller.ts`; extend `src/reader/autoscroll.ts` with the class; modify `tests/harness/lectorium.ts`; test `tests/e2e/lectorium.spec.ts` (new tests in a `describe('scroll mode')`).

**Produces:**
- `class Autoscroll { constructor(hooks: { advance(px: number): boolean; speed(): number; onEnd(): Promise<boolean>; onState(playing: boolean): void }); readonly playing: boolean; play(): void; pause(): void; hold(): void; destroy(): void }`. `hold()` stops the motion and plays again 1.5 s after the last call. `onEnd` is called 1.5 s after `advance` returns false; true means carry on in the new chapter. Wake lock requested on play and released on pause and destroy, errors ignored. `visibilitychange` to hidden pauses.
- `ReadingController` constructor takes `look: ReaderLook & { mode?: ReadingMode; pace?: number }`; new `mode`, `setMode(mode): Promise<void>`, `setPace(pace): void`, `play()`, `pause()`, `playing`, and an `onPlaying?: (playing: boolean) => void` passed as a fifth constructor argument. In Scroll mode `next()`/`prev()` cross chapters at the edges as now, opening the next chapter at its top and the previous one at its bottom; a hand scroll saves the place at most once a second and calls `autoscroll.hold()` when playing; `onEdge` calls `next()`/`prev()`. `setLook` and `setMode` pause.

- [ ] Tests:
  - `switches to scroll mode and back at the same place` (fraction kept within one screen, same chapter).
  - `saves the place after a hand scroll` (stored fraction changes within 1.5 s; reopening in scroll mode returns there).
  - `autoscroll moves the text and pauses` (scrollTop grows over 1 s at pace 400; after `pause()` it stays put).
  - `autoscroll crosses into the next chapter` (start near the end of chapter 0; within 5 s the spine index is 1 and playing is still true).
  - `autoscroll stops at the end of the book` (last chapter near its end; playing turns false; the edge button reads "End of the book").
  - `a hand scroll holds autoscroll and it carries on` (wheel during play; scrollTop stays for 1 s, then grows again).
  - `closing stops the animation` (destroy while playing; no frame, no further scroll events).
  - `a chapter of only a picture is passed through` (fixture chapter with one image and no text, if longBook has none add one to `tests/fixtures/catalog.ts` as a separate small book `pictureBook`).
- [ ] Run, fail, implement, pass; full `npx playwright test tests/e2e/lectorium.spec.ts tests/e2e/paginator.spec.ts`.
- [ ] Commit.

### Task 5: Lectorium interface

**Files:** modify `src/ui/Lectorium.svelte`, `src/ui/Icon.svelte` (play and pause icons, if missing); test `tests/e2e/app.spec.ts` (new `describe('scroll mode')`).

**Consumes:** Tasks 1 and 4.

- Text panel: a group "Reading" with *Pages* / *Scroll* (`aria-pressed`), and in Scroll mode a "Guide line" switch (`role="switch"`). `restyle` gains mode handling: `ctrl.setMode`.
- Autoscroll bar (Scroll mode only): buttons "Slower" and "Faster" (disabled at the ends), the pace "200 words/min", and "Play"/"Pause" (`aria-pressed` not used; the label changes). Class `playing` sets opacity 0.5, back to 1 on hover and focus-within.
- Taps: in Scroll mode `onPageClick` toggles play; swipes and zones are off. Keys in Scroll mode: Space play/pause, `+`/`=` faster, `-` slower; arrows left/right and Page Up/Down call `turn`; up/down are left to the browser.
- Pauses: an `$effect` pauses when `panelOpen` or `lookOpen` becomes true; note textareas pause on focus.
- Status line: Scroll mode drops "Page x of y" and the fit bar's "x / y".
- Guide line: an element over the sheet at `top: 33.3%`, `pointer-events: none`, shown when Scroll mode and `guideLine`.
- Aria label of the page in Scroll mode: "Book text. Scroll to read. Tap or press Space to start or stop scrolling by itself."

- [ ] Tests:
  - `chooses scroll mode in the text panel and keeps it after a reload`.
  - `plays and pauses autoscroll with the bar, a tap and Space`.
  - `opening the contents pauses autoscroll`.
  - `changes the pace with the buttons and remembers it` (Faster from 200 shows 225; reload shows 225; Slower disabled at 100).
  - `a larger text keeps the pace and scrolls faster in pixels`.
  - `switching back to pages while playing stops the motion` (scrollTop of the old host no longer changes; page counter is back).
  - `shows the guide line only in scroll mode with the switch on`.
  - `fits a 360 px phone in scroll mode` (no horizontal overflow; the bar fits).
- [ ] Run, fail, implement, pass. Then the full gate: `npm run lint`, `npm run typecheck`, `npm test -- --coverage`, `npx playwright test`.
- [ ] Commit; `npx vite build` for the phone preview.

### Task 6: Hand test and records

- [ ] Giuseppe tests on his phone (spec section 8, "By hand").
- [ ] Update the memory of the launch plan (step 6 done or what is left).
