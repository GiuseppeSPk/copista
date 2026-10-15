# Read aloud in beta: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the voice into the Lectorium as a beta, make the reading follow the page, and add
the tools to tune its warmth and pace by blind listening.

**Architecture:**

- The Auditorium room goes. Its setup becomes a sheet opened from the Listen tool, with its
  state in a small module so a download outlives the sheet.
- A new `ReadAloud` class in `src/rooms/lectorium/aloud.ts` drives listening:
  - it uses the reading controller to highlight, follow and continue;
  - it uses `listen()` for a bounded queue of audio made ahead.
- The warmth levers are options that default to today's behaviour. A development-only lab
  page compares them blind, and the winners become the defaults in the last task.

**Tech stack:** Svelte 5, TypeScript, Vite, Vitest (jsdom), Playwright (Chromium, Firefox,
WebKit), onnxruntime-web 1.30.0 in a worker.

**Spec:** `docs/design/2026-10-15-voice-beta-design.md`. It builds on
`docs/design/2026-10-13-voices-design.md`.

## Global constraints

- These settings were chosen by ear and do not change without a blind test:
  - 16 steps where the device keeps up (`pickSteps`);
  - speed 1.1;
  - seeds M2 = 2 and F1 = 1;
  - commas left alone;
  - fp16 weights.
- Every lever defaults to today's sound until the final task: 0.3 s after every piece, no
  fade, no tone shaping, no text fixes, the current noise.
- All UI copy is in English, in the app's voice. "Beta" appears in exactly three places: the
  sheet title, the Listen bar, and the home line "Can read aloud · Beta".
- Every new control fits a 320 px wide viewport in the light, sepia and dark looks.
- Checks before every commit (the commit gate runs them): `npm run lint`, `npm run typecheck`,
  `npm test -- --coverage`. Run e2e with `npx playwright test` before each commit that touches
  the UI.
- `NODE_OPTIONS=--max-old-space-size=2048`; never higher.
- Commit messages copy `git log` style: one long plain sentence, no prefix, no attribution.
- No push.

## Review focus

1. **The voice is removed from the sheet while it is reading.** Listening stops at once,
   with no error and no stuck bar. The test goes in Task 7.
2. **A chapter has no readable text,** for example a cover picture. Reading moves on to the
   next chapter that has text, and at the end of the book it stops quietly. The test goes in
   Task 6.
3. **Text size, page mode or window size changes while reading.** Reading restarts at the
   first block on screen, with no highlight left in the old document. The test goes in
   Task 6.
4. **Next or previous is pressed quickly several times, or previous on the first piece.**
   Only one piece plays at a time, and the index stays within the chapter. The test goes in
   Task 4.
5. **The reader leaves the Lectorium during a download.** The download is cancelled with no
   unhandled rejection, and the sheet then shows "Download the voice" again. The test goes in
   Task 1.

---

### Task 1: The voice sheet in the Lectorium

The Auditorium still exists after this task, so every commit leaves a way to set up the voice.

**Files:**
- Create: `src/ui/voice.svelte.ts`, `src/ui/VoiceSheet.svelte`
- Modify: `src/ui/Lectorium.svelte` (toolbar Listen, around lines 613–625; the sheet next to
  `#reader-look`), `src/ui/styles.css` (`.beta`)
- Test: `tests/e2e/app.spec.ts` (`describe('Listen')`)

**Interfaces:**
- Produces, in `src/ui/voice.svelte.ts`:
  - `voice: { status: VoiceStatus | null; progress: { done: number; total: number } | null; message: { tone: 'ok' | 'error'; text: string } | undefined }`, a `$state` object mutated in
    place;
  - `measureVoice(): Promise<void>`;
  - `downloadVoice(): Promise<void>`;
  - `cancelDownload(): void`;
  - `removeVoiceHere(): Promise<void>`;
  - `chooseReader(id: VoiceId): Promise<void>`;
  - `READERS` (moved from `Auditorium.svelte`).
- Produces `VoiceSheet.svelte`, with props `{ onListen: () => void; onClose: () => void }` and
  root `<section id="voice-sheet" aria-labelledby="voice-sheet-title">`.
- Consumes `voiceStatus`, `installVoice`, `removeVoice`, `DOWNLOAD_BYTES` and `VOICE_HOST` from
  `src/rooms/auditorium`.

- [ ] **Step 1: Write the failing e2e tests** in `describe('Listen')`:
  - Rewrite `'shows only once the voice is set up'` as `'opens the voice sheet when the voice is not set up'`:
    - With `copista-test-voice = absent`, click `Listen`.
    - Expect a heading `The Lector` with the text `Beta` beside it.
    - Expect the two `audio` samples.
    - Expect `Download the voice` to be disabled until `I accept the licence and its use restrictions` is checked.
  - Add `'sets the voice up from the sheet and reads from here'`:
    - Accept, download, and expect the status `The voice is ready.`.
    - Click `Listen from here`.
    - Expect the sheet hidden and `Listen` with `aria-pressed="true"`.
    - Skip in WebKit with the existing reason.
  - Add `'keeps downloading with the sheet closed'`:
    - Start the download and press Escape.
    - Reopen the sheet; expect a `progressbar`, or the ready status.
  - Add `'cancels the download on leaving the Lectorium'`:
    - Start the download and go to the Bibliotheca.
    - Come back and open the sheet.
    - Expect `Download the voice` and no `alert`.
  - Update `'fits all seven reading tools'`: the voice is absent, and Listen is still counted.

- [ ] **Step 2: Run them and see them fail.**
  Run: `npx playwright test tests/e2e/app.spec.ts -g "Listen" --project=chromium`
  Expected: FAIL, because there is no Listen button without the voice.

- [ ] **Step 3: Implement `src/ui/voice.svelte.ts`**, lifting `measure`, `download`, `remove`
  and `choose` out of `Auditorium.svelte`, with the same messages. One change: on success the
  message is `The voice is ready.`.
  - `cancelDownload()` aborts the current controller.
  - The Lectorium calls `cancelDownload()` in its `onMount` cleanup.

- [ ] **Step 4: Implement `VoiceSheet.svelte`.**
  - Markup and copy follow the Auditorium's sections in the same order.
  - The headings are `h3`, under a title `h2#voice-sheet-title` "The Lector" followed by
    `<span class="beta">Beta</span>`.
  - Add the line under the introduction: "The voice is new. It may stumble over a name or a
    number; it gets better with each version."
  - Once installed, after a download, show a primary button `Listen from here` that calls
    `onListen`.
  - Close button: `aria-label="Close"`, top right.
  - Layout: a panel above the reading bar, `max-width: 32rem`, centred, `max-height: 70vh` (or
    `70dvh`), scrolling inside, with the Look panel's surface, border, radius and shadow tokens.
  - On phones it spans the width with the 16 px gutter.
  - `.beta`: small caps, `letter-spacing: 0.06em`, the accent colour, no box.

- [ ] **Step 5: Wire it in the Lectorium.**
  - Listen is always rendered.
  - When `voice.status?.installed` is false, Listen toggles `sheetOpen`, with
    `aria-controls="voice-sheet"` and `aria-expanded`.
  - Otherwise it keeps today's `aria-pressed` toggle.
  - Escape and a pointer down outside close the sheet, as for Look. Opening the sheet closes
    Look and the reverse.
  - Replace `voiceReady` with `voice.status?.installed`. Call `measureVoice()` on mount.

- [ ] **Step 6: Run the Listen tests in all three browsers, then the whole e2e suite.**
  Run: `npx playwright test tests/e2e/app.spec.ts -g "Listen"`, then `npx playwright test`.
  Expected: PASS. WebKit skips only the playback tests, with the stated reason.

- [ ] **Step 7: Commit:** `Set the voice up from a sheet in the Lectorium, opened from Listen, with the download carrying on while the sheet is closed`

### Task 2: The Auditorium removed

**Files:**
- Delete: `src/ui/Auditorium.svelte`
- Move: `src/rooms/auditorium/index.ts` to `src/rooms/voice/index.ts`, and
  `tests/unit/rooms/auditorium.test.ts` to `tests/unit/rooms/voice.test.ts`
- Modify:
  - `src/ui/route.ts`, `src/ui/rooms.ts` (the entry at line 75), `src/ui/App.svelte` (lines 4,
    74, 278–279), `src/ui/Home.svelte` (door at 199–214, styles of `.door-listen`, the line in
    the Lectorium door);
  - `src/ui/Guide.svelte` (`auditorium` entry), `src/ui/Archivum.svelte:119`,
    `src/voice/store.ts:236`, the comment at `src/ui/Lectorium.svelte:57`, `src/ui/voice.svelte.ts`
    imports;
  - `tests/unit/ui/route.test.ts`, `tests/e2e/app.spec.ts` (the lines that name Auditorium:
    28, 817–935, 910, 1176, 1193, 1203, 1236).

**Interfaces:**
- Produces: `Route` without `auditorium`. `parseHash('#/auditorium')` returns
  `{ room: 'lectorium' }`.

- [ ] **Step 1: Write the failing tests.**
  - Unit: in `route.test.ts`, `parseHash('#/auditorium')` equals `{ room: 'lectorium' }`;
    remove `auditorium` from the round-trip list.
  - e2e `'the home page has four doors and says the Lectorium can read aloud'`:
    - expect 4 `.door` links, none to `#/auditorium`;
    - the Lectorium door contains `Can read aloud · Beta`.
  - e2e: key `5` does nothing on the home page.
  - Delete the `describe('Auditorium')` tests that Task 1's sheet tests now cover (samples,
    licence, download, remove). Port any assertion they had that Task 1 lacks (space used,
    Remove the voice, Cancel) to the sheet, against the sheet's locators.
  - Remove Auditorium from the room loops at 910, 1176, 1193, 1203 and 1236.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run tests/unit/ui/route.test.ts`
  and the two new e2e tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `parseHash` maps `auditorium` to `{ room: 'lectorium' }`.
  - Keys become `'01234'`.
  - Home: remove the door and the `.door-listen` CSS. In the Lectorium door, after its
    `door-body`, add `<span class="door-note">Can read aloud · <span class="beta">Beta</span></span>`,
    in the door's small text style, with no icon.
  - Guide: drop the entry.
  - Archivum: "The voice is optional. If you set it up from Listen in the Lectorium, its files
    are downloaded once from…", keeping the rest of the sentence.
  - `store.ts`: "The voice is not installed. Set it up from Listen in the Lectorium."
  - Move the rooms module and fix its imports.
- [ ] **Step 4: Check the home page by eye.** Take screenshots at 320, 768 and 1280 px, light
  and dark. Expect four doors with even gaps and no hole where the fifth was. Fix the grid if
  it was built for five.
- [ ] **Step 5: Run all checks and e2e.** Expected: PASS. `architecture.test.ts` passes with
  `src/rooms/voice`.
- [ ] **Step 6: Commit:** `Remove the Auditorium: the home page has four doors again, the Lectorium's says it can read aloud, and an old link to it opens the Lectorium`

### Task 3: Endings, pauses and the fade, outside the worker

**Files:**
- Modify: `src/voice/text.ts`, `src/voice/audio.ts`, `src/voice/supertonic.ts:55,271`,
  `src/voice/worker.ts:27,72`
- Test: `tests/unit/voice/text.test.ts`, `tests/unit/voice/audio.test.ts` (new),
  `tests/unit/voice/supertonic.test.ts`

**Interfaces:**
- Produces in `text.ts`:
  - `type Ending = 'piece' | 'paragraph' | 'heading' | 'chapter'`;
  - `Piece` gains `ends: Ending`, meaning what follows the piece. It is `'chapter'` for the last
    piece, `'heading'` for the last piece of an `h1`–`h6`, `'paragraph'` for the last piece of
    any other block, and `'piece'` otherwise.
- Produces in `audio.ts`:
  - `interface Finish { pauses: Record<Ending, number>; fadeMs: number }`;
  - `const TODAY: Finish = { pauses: { piece: 0.3, paragraph: 0.3, heading: 0.3, chapter: 0.3 }, fadeMs: 0 }`;
  - `finishPiece(samples: Float32Array, rate: number, ends: Ending, finish: Finish): Float32Array`
    returns the samples with the fade applied over the last `fadeMs`, then the pause as zeros.
- Changes: `Supertonic.speak` returns the spoken samples only, with no trailing silence. The
  worker's self-test no longer subtracts `SILENCE`, and both constants go.

- [ ] **Step 1: Write the failing tests.**
  - `text.test.ts`, on a chapter with `h2`, two `p` (one over 300 characters) and a `li`:
    the `ends` sequence equals exactly `['heading', 'piece', 'paragraph', 'paragraph', 'chapter']`,
    built from the fixture.
  - `audio.test.ts`:
    - `finishPiece(ones(1000), 1000, 'paragraph', { ...TODAY, pauses: { ...TODAY.pauses, paragraph: 0.6 } })`
      has length 1600, its first 1000 values are 1, and the rest are 0;
    - with `fadeMs: 15` at rate 1000, the last spoken sample is 0, sample 984 is 1, and the
      values fall monotonically between them;
    - `TODAY` reproduces today's length: spoken + 0.3 s.
  - `supertonic.test.ts`: update any assertion that counted the trailing silence.
- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run tests/unit/voice`
- [ ] **Step 3: Implement.** In `piecesOf`, compute `ends` per block's last piece, from the
  block's `localName`.
- [ ] **Step 4: Run them and see them pass.** Run: `npx vitest run tests/unit/voice`
- [ ] **Step 5: Commit:** `Add the pause after each piece in the page rather than in the worker, so it can follow what comes next, still 0.3 s everywhere`

### Task 4: A queue ahead, with pause, skip and catching up

**Files:**
- Modify: `src/voice/listen.ts`, and its caller in `src/ui/Lectorium.svelte`, which is
  replaced in Task 7
- Test: `tests/unit/voice/listen.test.ts`

**Interfaces:**
- Produces in `listen.ts`:
  ```ts
  export interface Player {
    play(samples: Float32Array, signal: AbortSignal): Promise<void>;
    pause(): void;
    resume(): void;
  }
  export interface ListenEvents {
    onPiece(index: number): void;      // a piece starts playing
    onWaiting(waiting: boolean): void; // playback waits for the voice
  }
  export interface Listening {
    stop(): void;
    pause(): void;
    resume(): void;
    skip(by: 1 | -1): void;            // clamped to the chapter
    readonly paused: boolean;
    readonly done: Promise<void>;
  }
  export const AHEAD_SECONDS = 120;
  export function listen(
    narrator: Pick<Narrator, 'speak' | 'sampleRate'>,
    pieces: readonly { text: string; ends: Ending }[],
    lang: Lang,
    voice: VoiceId,
    player: Player,
    finish: Finish,
    events: ListenEvents,
  ): Listening;
  ```
- Rules:
  - Generation runs one piece at a time, in order. It stops while the made but unplayed audio
    exceeds `AHEAD_SECONDS`, and drops a piece once it has played.
  - `skip` aborts the current play and moves the index. A piece already made is reused, and
    generation restarts from the new index otherwise. A piece made after it was skipped past is
    discarded.
  - `onWaiting(true)` fires when the next piece is not ready, and `onWaiting(false)` when it
    starts.
  - Before playing, each piece passes through `finishPiece(..., piece.ends, finish)`.

- [ ] **Step 1: Write the failing tests.** Use a fake narrator whose `speak` resolves from a
  controllable promise per call, and a fake player.
  - `'never holds more than two minutes ahead'`: with pieces of 50 s each and the player held
    on piece 0, at most 3 `speak` calls are made, the two pieces made ahead plus the one
    playing.
  - `'reports waiting when playback catches up'`: the waiting events are `[true, false]`
    around a slow piece.
  - `'skips forward and back within the chapter'`: from piece 0, `skip(1)` twice then
    `skip(-1)` plays pieces 0, 1, 2 and 1 in order. `skip(-1)` on piece 0 stays on 0.
  - `'plays one piece at a time under quick skips'`: five `skip(1)` calls in the same tick
    never have two `play` calls pending at once.
  - `'pause and resume reach the player'`.
  - `'pads each piece by its ending'`: the samples handed to the player have
    `spoken + pause * rate` length.
  - Keep the existing tests, adapted to the new signature.
- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run tests/unit/voice/listen.test.ts`
- [ ] **Step 3: Implement**, and adapt the Lectorium's call so the app still reads. Wrap
  `Speaker` as a `Player`, adding `pause()` and `resume()` to `Speaker`, using
  `this.audio.pause()` and `this.audio.play()`.
- [ ] **Step 4: Run the unit tests and the Listen e2e tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `Make up to two minutes of the voice ahead, and let the reading pause, resume and move a piece back or forward`

### Task 5: Highlight, follow and continue in the reader

**Files:**
- Modify: `src/reader/paginator.ts` (`ChapterView`, `Paginator`), `src/reader/scroller.ts`,
  `src/rooms/lectorium/controller.ts`
- Test: `tests/e2e/paginator.spec.ts`, `tests/e2e/scroller.spec.ts`,
  `tests/unit/rooms/lectorium.test.ts`

**Interfaces:**
- Produces on `ChapterView`:
  - `highlight(range: Range | null): void`. It registers `new win.Highlight(range)` as
    `copista-reading` in the frame window's `CSS.highlights`, deletes it when `null`, and does
    nothing where `win.CSS?.highlights` is missing.
  - `reveal(range: Range): boolean`. It brings the range on screen and returns whether the view
    moved.
- The highlight style is written into the chapter document with `writeLayoutStyle`'s sibling
  id `copista-reading-style`: `::highlight(copista-reading) { background-color: <accent at 22%> }`,
  with one value per look (light, sepia, dark), taken from the reader's existing look tokens.
- `Paginator.reveal` turns to the page that holds the range's first client rect.
- `Scroller.reveal` acts when the range's top is outside the band from the top 1/8 to 2/3 of
  the screen. It then glides so the top sits at 1/3: a `requestAnimationFrame` loop over about
  300 ms that calls `moveTo` each frame, so it never counts as a hand scroll. Under
  `prefers-reduced-motion: reduce` it jumps instead.
- `ReadingController` gains:
  - a 6th constructor argument, `onReaderMove?: () => void`. It is called after `next()`,
    `prev()`, `goTo()`, `setLook()` and `setMode()`, and 400 ms after the last hand scroll.
    It is never called for `follow` or `continueReading`;
  - `follow(range: Range | null): void`. It calls `view.highlight(range)`, then `view.reveal`;
    when the view moved, it saves the place through `run(() => this.moved())`;
  - `continueReading(): Promise<boolean>`, which is `openNextChapter` run in the queue, with no
    `onReaderMove`.

- [ ] **Step 1: Write the failing tests.**
  - `paginator.spec.ts`, `'reveals a range on a later page and highlights it'`:
    - take a range in the last paragraph of a multi-page chapter;
    - `reveal` returns true and `page` equals `pageCount - 1`;
    - in Chromium, the frame window's `CSS.highlights.has('copista-reading')` is true, and
      false after `highlight(null)`.
  - `scroller.spec.ts`, `'reveals a range in the upper third without counting as a hand scroll'`:
    after `reveal`, the range's top lies between 1/8 and 1/2 of the host height, and
    `onHandScroll` was not called.
  - `lectorium.test.ts`, with a fake view in the existing style:
    - `onReaderMove` is called for `next()` and not for `follow()` or `continueReading()`;
    - `continueReading()` returns false on the last chapter.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the views' e2e in all three browsers and the unit tests.** Expected: PASS.
  WebKit and Firefox assert the highlight only where `CSS.highlights` exists.
- [ ] **Step 5: Commit:** `Let the reader mark a stretch of text and bring it on screen, and tell a move by the reader from a move by the reading`

### Task 6: ReadAloud, the reading that follows the page

**Files:**
- Create: `src/rooms/lectorium/aloud.ts`
- Test: `tests/unit/rooms/aloud.test.ts`

**Interfaces:**
- Consumes `listen`, `Player`, `Finish` and `TODAY` (Tasks 3–4), `piecesOf`, `rangeOf` and
  `Ending`, and the controller's `listeningStart`, `follow`, `continueReading` and
  `onReaderMove` (Task 5).
- Produces:
  ```ts
  export interface AloudState { piece: string; waiting: boolean; paused: boolean }
  export class ReadAloud {
    constructor(deps: {
      reader: Pick<ReadingController, 'listeningStart' | 'follow' | 'continueReading' | 'pause'>;
      narrator: Pick<Narrator, 'speak' | 'sampleRate'>;
      player: Player;
      lang: Lang;
      voice: () => VoiceId;
      finish?: Finish;               // TODAY by default
      onState(state: AloudState | null): void; // null once reading has stopped
      onError(error: unknown): void;
    });
    start(): boolean;   // from the first block on screen; false when nothing to read
    restart(): void;    // the reader moved: start again from the first block on screen
    pause(): void; resume(): void; skip(by: 1 | -1): void;
    stop(): void;
    get active(): boolean;
  }
  ```
- Behaviour:
  - `start` pauses autoscroll (`reader.pause()`).
  - On each `onPiece`, it calls `reader.follow(rangeOf(doc, piece))`, and `piece` in the state
    is the piece's text.
  - When `done` resolves without a stop, it calls `continueReading()` and starts from block 0
    of the new chapter. It repeats past chapters with no pieces. When `continueReading()`
    returns false, it calls `follow(null)` and `onState(null)`.
  - `stop` calls `follow(null)`.
  - `restart` stops without clearing the bar, then starts again. It is ignored while not
    active.

- [ ] **Step 1: Write the failing tests** with jsdom documents, a fake reader holding a list of
  chapter documents, the `FakeNarrator`, and a player that resolves at once:
  - `'follows each piece'`: `follow` receives one range per piece in order, then `null` at the
    end of the book.
  - `'carries on into the next chapter, past one with nothing to read'`: the chapters are
    [text, a picture only, text]. Every piece of chapters 0 and 2 is played. This is Review
    focus 2.
  - `'restarts where the reader moved'`: after `restart()`, the next piece played starts at the
    fake reader's new first block, and the old document gets `follow(null)` first. This is
    Review focus 3.
  - `'stops cleanly'`: after `stop()`, nothing more is played, the last state is `null`, and
    `onError` is not called.
- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run tests/unit/rooms/aloud.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** together with `architecture.test.ts`.
- [ ] **Step 5: Commit:** `Follow the reading on the page: mark the piece being read, keep it on screen, restart where the reader moves, and go on into the next chapter`

### Task 7: The Listen bar, the lock screen, and the Lectorium wired

**Files:**
- Create: `src/ui/ListenBar.svelte`, `src/voice/session.ts`
- Modify: `src/ui/Lectorium.svelte`
- Test: `tests/e2e/app.spec.ts` (`describe('Listen')`), `tests/unit/voice/session.test.ts`

**Interfaces:**
- `ListenBar.svelte` props:
  `{ reader: string; paused: boolean; waiting: boolean; onToggle(): void; onSkip(by: 1 | -1): void; onVoice(): void; onClose(): void }`.
  - Root: `<div class="listen-bar" role="region" aria-label="Listening">`.
  - Buttons: `Previous` (aria-label), `Pause` or `Play`, `Next`, the reader's name with
    `<span class="beta">Beta</span>` (it opens the sheet), and `Stop listening` (×).
  - While waiting, a `role="status"` line in place of the name reads `The Lector is catching up…`
    (or `The Lectrix…`).
  - At most 56 px high, the reader's surface and shadow tokens, icons at 18 px as in the
    toolbar.
- `src/voice/session.ts`:
  `mediaSession(meta: { title: string; artist: string }, actions: { play(): void; pause(): void; previous(): void; next(): void }): { playing(on: boolean): void; release(): void }`.
  It does nothing where `navigator.mediaSession` is missing.
- Lectorium:
  - It creates a `ReadAloud` on Listen, passing `onReaderMove: () => aloud?.restart()` to the
    controller.
  - The bar shows while `aloudState !== null`, and Listen's `aria-pressed` follows it.
  - `autoscroll()` stops the reading, and `start()` pauses autoscroll.
  - Removing the voice from the sheet stops the reading.
  - Media Session metadata is the book's title and author.

- [ ] **Step 1: Write the failing tests.** Skip the playback tests in WebKit with the existing
  reason.
  - `'shows the bar while reading, and Stop listening hides it'`.
  - `'highlights the piece and turns the page to follow it'`:
    - use the long book in page mode, with the fake narrator at its default speed;
    - after Listen, the page number shown advances without input within 20 s;
    - in Chromium, the frame has `copista-reading` in `CSS.highlights`.
  - `'turning the page by hand restarts the reading there'`: press ArrowRight. The next played
    piece's text starts with the first visible block's text. Expose the last spoken text on
    `window.spoken` from the init script, by wrapping `FakeNarrator` through the test key.
  - `'reading continues into the next chapter'`: on a short chapter, the chapter title in the
    bar or header changes without input.
  - `'listening and autoscroll exclude each other'`, both ways.
  - `'removing the voice stops the reading'`: open the sheet from the bar's name and remove.
    The bar goes, and there is no `alert`. This is Review focus 1.
  - `'the bar fits a 320 px phone in the three looks'`: every button's box is inside 0–320,
    and nothing is clipped.
  - Unit `session.test.ts`: with a stubbed `navigator.mediaSession`, the handlers are set and
    `release()` clears them; without it, nothing throws.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Remove the old `toggleListen` body. The Lectorium keeps only the
  wiring.
- [ ] **Step 4: Check by eye.** Take screenshots of the bar and the sheet at 320 and 1280 px in
  light, sepia and dark, and adjust the spacing until the bar reads as part of the toolbar
  family.
- [ ] **Step 5: Run all checks and the whole e2e suite.** Expected: PASS, with only the WebKit
  playback skips.
- [ ] **Step 6: Commit:** `Add the Listen bar, with previous, pause and next, the reader to change, and play and pause on the lock screen`

### Task 8: The levers, all off by default

**Files:**
- Modify: `src/voice/narrator.ts` (`WorkerRequest`, `Narrator.speak`), `src/voice/worker.ts`,
  `src/voice/supertonic.ts`, `src/voice/audio.ts`
- Test: `tests/unit/voice/supertonic.test.ts`, `tests/unit/voice/audio.test.ts`,
  `tests/unit/voice/narrator.test.ts`

**Interfaces:**
- Produces:
  - `type TextFix = 'abbreviations' | 'roman'`;
  - `interface Tuning { seed?: number; speed?: number; fixes?: readonly TextFix[]; noise?: 'latent' | 'frame' }`;
  - `Narrator.speak(text, lang, voice, tuning?: Tuning)`;
  - the worker's speak request gains `tuning?: Tuning`, and a missing field keeps today's
    value;
  - `preprocessText(text, lang, fixes: readonly TextFix[] = [])`;
  - `frameNoise(dim, length, seed)`;
  - `shapeTone(samples: Float32Array, rate: number): Float32Array`.
- Source for the fixes: `voci_codice_proposto` lines 646–686 and 806–819. Each abbreviation
  pattern ends with `(?!\w)` instead of relying on `\b` alone.
- `shapeTone`:
  - a low shelf of +2 dB at 200 Hz, then a peaking filter of +1.5 dB at 400 Hz with Q 0.8,
    then a soft compressor (threshold −18 dBFS, ratio 2:1, attack 10 ms, release 120 ms),
    peak-limited to −1 dBFS;
  - biquads from the RBJ cookbook, in a few dozen lines;
  - `Finish` gains `tone: boolean`, false in `TODAY`.

- [ ] **Step 1: Write the failing tests.**
  - With `['roman']`, `'Capitolo XIV'` becomes `'Capitolo quattordicesimo'` and
    `'Luigi XIV'` is unchanged.
  - With `['abbreviations']`, `'il sig. Rossi'` gives `signor` and `'ecc.'` gives `eccetera`.
    `'sig.ra'` gives `signora`, and `'design.'` is unchanged.
  - With no fixes, the output equals today's for the existing fixture sentences.
  - `frameNoise(4, 10, 2)` equals the first 10 frames of `frameNoise(4, 50, 2)`.
  - `shapeTone`:
    - keeps the length;
    - the peak stays ≤ 0.891, which is −1 dBFS;
    - a 200 Hz sine comes out louder than a 4 kHz sine of the same input level.
  - The narrator forwards `tuning` in the request.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run all unit tests.** Expected: PASS, and the existing ones unchanged.
- [ ] **Step 5: Commit:** `Add the voice's untested levers, each off unless asked for: Italian abbreviations and Roman numerals, frame noise, and a gentle warmth on the tone`

### Task 9: The voice lab (development only)

**Files:**
- Create: `voice-lab.html` at the root, `src/voice/lab/main.ts`, `src/voice/lab/passages.ts`,
  `src/voice/lab/blind.ts`
- Test: `tests/unit/voice/blind.test.ts`

**Interfaces:**
- `blind.ts`:
  - `interface Trial { name: string; a: Variant; b: Variant }`, where
    `Variant = { label: string; tuning: Tuning; finish: Finish }`;
  - `shuffle(trials, seed): { trial: Trial; first: 'a' | 'b' }[]`;
  - `tally(answers): Record<string, { a: number; b: number; same: number }>`.
- `passages.ts` holds about five passages, kept short and public domain:
  - a Collodi passage and a Manzoni passage;
  - a dialogue;
  - a passage with `Capitolo XIV`, `sig.` and `ecc.`;
  - an English paragraph (Austen).
  Each passage is several paragraphs and a heading, so the pauses are heard.
- The page:
  - it has no link from the app and is not in the build: `vite.config.ts` keeps the default
    single input. Check that `dist/` has no `voice-lab.html` after `npm run build`;
  - it loads the installed voice;
  - for each trial it plays the two variants in a random order, labelled "First" and "Second",
    over a whole passage, through `finishPiece`, with buttons First, Second and Same;
  - only at the end does it show the tally and the variant names, as a table with a "Copy as
    text" button.
- The trials, in order:
  1. pauses `TODAY` against `{ piece: 0.3, paragraph: 0.6, heading: 0.9, chapter: 1.5 }`;
  2. no fade against 15 ms;
  3. each text fix on its own;
  4. `latent` against `frame` noise;
  5. tone off against on;
  6. seeds M2: 2 against 5 and 7, and F1: 1 against 3 and 4;
  7. speed 1.1 against 1.0 on whole paragraphs.

- [ ] **Step 1: Write the failing tests:** `shuffle` with a fixed seed is deterministic and
  balanced; `tally` counts answers per trial.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run all checks, then `npm run build`, and confirm `dist/voice-lab.html` is
  absent.** Open `/voice-lab.html` on the dev server with the real voice and run one trial by
  hand to see that it plays.
- [ ] **Step 5: Commit:** `Add a page for development that plays two settings of the voice in a hidden order over whole passages and counts which one is preferred`

### Task 10: The winners as defaults, and new samples (waits for Giuseppe's listening)

Start this task only after Giuseppe has run the lab and sent the tally.

- [ ] **Step 1:** Write the tally into section 7 of the design as a dated record, in the style
  of the 13 October by-ear notes.
- [ ] **Step 2:** For each winning lever, add a unit test that pins the new default: the
  `TODAY` values become `DEFAULT_FINISH`, plus the worker's defaults for seed, speed, fixes and
  noise. Run the test, see it fail, change the default, and see it pass.
- [ ] **Step 3:** Record `public/voice/{lector,lectrix}.{webm,m4a}` again with the final
  settings, in the same way as in cb3c872. Giuseppe listens before the commit.
- [ ] **Step 4:** Run all checks and the e2e suite.
- [ ] **Step 5: Commit:** `Read with the settings chosen by ear in the blind tests of <date>, and record the two samples again with them`
