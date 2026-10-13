# Read aloud: implementation plan

**Goal:** the Lector reads a book aloud in the Lectorium with the Supertonic 3 voice, downloaded
on request from the Auditorium, on every device that can run it.

**Architecture:** a new `src/voice/` layer (depends on `core` only) holds the text pieces, the
download store, the narrator worker and the player. The service worker adds the isolation
headers once the voice is installed. The Auditorium room sets the voice up; the Lectorium's
`ReadingController` drives the player and asks its `ChapterView` to show and highlight each
piece.

**Tech stack:** Svelte 5, TypeScript, onnxruntime-web 1.30.0 (worker only, not bundled),
Vitest, Playwright (Chromium, WebKit, offline).

**Spec:** [2026-10-13-voices-design.md](2026-10-13-voices-design.md)

## Global constraints

- Model files from `https://huggingface.co/GiuseppeSPk/copista-voice/resolve/cddb9ee79954ec63e65ebc147464b0610b648c2c/<path>`, sizes and SHA-256 as in Task 3.
- Cache `copista-voice-v1` holds the model files and the profile; nothing else uses that name.
- Call settings: speed 1.05, 0.3 s of silence between pieces, voices `M2` (Lector) and `F1` (Lectrix), steps 8 or 6, never fewer.
- Steps: 8 when the self-test RTF is below 0.8, otherwise 6; stored with the voice; measured again when the backend changes.
- Backend: WebGPU when an adapter is given, otherwise wasm with `min(4, hardwareConcurrency)` threads when `crossOriginIsolated`, else one thread. A lost WebGPU device switches the worker to wasm for the rest of the session and repeats the piece.
- Pieces: consecutive sentences of one block, at most 300 characters; longer sentences split at commas, then spaces.
- Buffer: at most 120 s of audio ahead.
- Disclaimer copy, exact: "Works best on recent phones and computers."
- onnxruntime-web runs only inside the worker; its files are served from `ort/1.30.0/` on copista.org and cached at runtime, never precached.
- CSP: `connect-src 'self' https://huggingface.co https://*.hf.co`; `media-src 'self' blob:` (the page has no media-src today, so blob audio would be blocked); `script-src 'self' 'wasm-unsafe-eval'`.
- Reading without a voice is unchanged: every existing test stays green unedited.
- UI copy in English. Commits in the repo's sentence style, no attribution. No push.
- Node runs with `NODE_OPTIONS=--max-old-space-size=2048`.

## Review focus

1. Isolation breaks something already there: with COOP/COEP on, a book must still open, show its pictures and print. Test in Task 6 (offline project: install a fake cache, reload, open the sample book).
2. A chapter with no readable text (a cover, a picture page): listening skips to the next chapter instead of stalling. Test in Task 8 (empty source) and Task 9 (picture chapter).
3. Leaving the Lectorium or closing the book while listening: audio stops, the worker stays alive but idle, blob URLs are revoked. Test in Task 8 (`stop` revokes) and Task 10.
4. A download interrupted halfway (network off, tab closed): next time the Auditorium shows "not installed" and installing again fetches only what is missing. Test in Task 3.
5. The last piece of the book: playback ends with the bar showing "End of the book", no error. Test in Task 8.

---

### Task 1: Layer and text pieces

**Files:** modify `scripts/architecture.ts` (`voice: ['core', 'voice']`, `rooms` gains `'voice'`), `tests/unit/architecture.test.ts`, `vitest.config.ts` (coverage includes `src/voice/**/*.ts`, excludes `src/voice/worker.ts`, `src/voice/supertonic.ts`, `src/voice/audio.ts`); create `src/voice/text.ts`; test `tests/unit/voice/text.test.ts`.

**Produces:**
- `type Lang = 'it' | 'en'`; `MAX_PIECE = 300`.
- `interface Piece { text: string; spineIndex: number; block: number; start: number; end: number }` (`block` indexes `readableBlocks(doc)`; `start`/`end` are offsets into that block's readable text).
- `readableBlocks(doc: Document): Element[]` — `p, h1–h6, li, blockquote, dt, dd, figcaption` in document order, innermost only (an `li` holding a `p` gives the `p`), none inside `ol.notes`, `ol.footnotes` or `pre`.
- `blockText(block: Element): string` — text with `sup > a` marks and pictures left out, whitespace collapsed.
- `piecesOf(doc: Document, lang: Lang, spineIndex: number): Piece[]`.
- `rangeOf(doc: Document, piece: Piece): Range | null` — the DOM range covering the piece in a live document, `null` when the block is gone.

- [ ] Architecture test: `voice` importing `reader` or `storage` fails; `rooms` importing `voice` passes.
- [ ] Text tests: an Italian chapter (`h1`, three `p`, a `ul` of two `li`, a `blockquote > p`, `ol.notes` with one note, a `p` with `<sup><a>1</a></sup>`, a `pre`, an `img`) gives blocks h1, p, p, p, li, li, p (in the quote) and no note or pre; the note mark's `1` is not in any piece; three short sentences of one `p` make one piece; two `p`s never share a piece; a 700-character sentence with commas splits only at commas into pieces of at most 300; one with no commas splits at spaces; `Sig. Rossi arrivò.` stays one sentence in `it`; `rangeOf(doc, piece).toString()` equals `piece.text` after whitespace collapsing, also across an `<em>`.
- [ ] Run `npx vitest run tests/unit/voice tests/unit/architecture.test.ts`: fails; implement; passes.
- [ ] Commit.

### Task 2: Typed-array Supertonic helper

**Files:** create `src/voice/supertonic.ts` (MIT notice of Supertone's `web/helper.js` at the top); test `tests/unit/voice/supertonic.test.ts`.

**Consumes:** `Lang`. Types only from `onnxruntime-web` (`import type`).

**Produces:**
- `preprocessText(text: string, lang: Lang): string` — same output as the original helper's `UnicodeProcessor.preprocessText` (NFKD, emoji removal, the replacement tables, final `.` added, `<lang>…</lang>` wrap).
- `class TextIds { constructor(indexer: number[]); encode(text: string, lang: Lang): BigInt64Array }` (batch of one; unknown code points give -1).
- `interface Style { ttl: Float32Array; ttlDims: number[]; dp: Float32Array; dpDims: number[] }`; `parseStyle(json: unknown): Style`.
- `latentSize(seconds: number, cfg: TtsConfig): { length: number; dim: number }` with `chunk = ae.base_chunk_size * ttl.chunk_compress_factor`, `length = ceil(seconds * sample_rate / chunk)`, `dim = ttl.latent_dim * ttl.chunk_compress_factor`.
- `class Supertonic { static create(ort: OrtModule, models: ModelBytes, cfg: TtsConfig, indexer: number[], options: { backend: 'webgpu' | 'wasm' }): Promise<Supertonic>; readonly sampleRate: number; speak(text: string, lang: Lang, style: Style, steps: number, speed: number): Promise<Float32Array>; release(): Promise<void> }` — one piece per call (pieces are already at most 300 characters), output trimmed to the predicted duration, followed by 0.3 s of silence.

- [ ] Parity tests: for `'Ciao — mondo'`, `'«Sì», disse.'`, `'e.g., a test @ home'`, `'Già 😀 fatto'`, `'Nessuna punteggiatura'`, the expected strings are what the original helper returns (computed once from `phone-helper.js` and pasted in); `encode` of `'<it>a</it>'` has the indexer's ids; `latentSize(1, cfg)` with the real `tts.json` numbers (`sample_rate` 44100, `base_chunk_size` 512, `chunk_compress_factor` 6, `latent_dim` 24) is `{ length: 15, dim: 144 }`; `parseStyle` flattens a `[1][2][3]` array into six floats in order.
- [ ] Run: fails; implement; passes.
- [ ] Commit.

### Task 3: Store

**Files:** create `src/voice/store.ts`; test `tests/unit/voice/store.test.ts` (fake `caches`, fake `fetch`, real `crypto.subtle`).

**Produces:**
- `VOICE_CACHE = 'copista-voice-v1'`, `VOICE_HOST = 'huggingface.co'`, `fileUrl(path: string): string`, `FILES: readonly { path: string; bytes: number; sha256: string }[]`, `TOTAL_BYTES`:

  | path | bytes | sha256 |
  | --- | --- | --- |
  | onnx/duration_predictor.onnx | 1994137 | 39429c60eb8f79bd7c152138bd8eb482c8ba667fc7d756b0e81258fdf51471d1 |
  | onnx/text_encoder.onnx | 18475126 | 223f1807ffd7d58cb0a0fb8fc94564dfe4031068bf487dc3a0faa2b7bd71ceb4 |
  | onnx/vector_estimator.onnx | 128735449 | aa0a3b717afcaa803d4baa37f48026a9bcafe43399359477aaa580fefdd443af |
  | onnx/vocoder.onnx | 50811298 | be7f961c7af823933522d6bf86393a10f95720697fc57426d8d2fc69e3d37582 |
  | onnx/tts.json | 8253 | 42078d3aef1cd43ab43021f3c54f47d2d75ceb4e75f627f118890128b06a0d09 |
  | onnx/unicode_indexer.json | 277676 | 9bf7346e43883a81f8645c81224f786d43c5b57f3641f6e7671a7d6c493cb24f |
  | voice_styles/M2.json | 292055 | b76cbf62bac707c710cf0ae5aba5e31eea1a6339a9734bfae33ab98499534a50 |
  | voice_styles/F1.json | 292046 | bbdec6ee00231c2c742ad05483df5334cab3b52fda3ba38e6a07059c4563dbc2 |

- `install(onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<void>` — skips files already cached, streams each one for progress, checks SHA-256, refetches once on a mismatch, then throws `VoiceDownloadError` (extends `CopistaError`); asks `navigator.storage.persist()` at the end.
- `isInstalled(): Promise<boolean>`, `remove(): Promise<void>`, `spaceUsed(): Promise<number>` (sum of the sizes of cached files), `readFile(path: string): Promise<ArrayBuffer>` (from the cache; used by the worker).
- `interface Profile { backend: 'webgpu' | 'wasm'; steps: 6 | 8 }`; `getProfile(): Promise<Profile | null>`, `saveProfile(p: Profile): Promise<void>` (a JSON entry in the same cache, so removing the voice removes it); `pickSteps(rtf: number): 6 | 8`.

- [ ] Tests: a full install puts eight entries and reports `done === total === TOTAL_BYTES` last; a file corrupted once is refetched and installs; corrupted twice throws `VoiceDownloadError` and leaves no entry for it; a fetch rejecting on the third file leaves two entries, `isInstalled()` false, and a second `install` fetches only six files; `remove()` empties `spaceUsed()` to 0 and drops the profile; `pickSteps(0.79) === 8`, `pickSteps(0.8) === 6`. The tests use small stand-in files: `FILES` is passed through an internal `setFilesForTest` or the functions take an optional manifest argument (pick one, keep it out of the public surface).
- [ ] Run: fails; implement; passes.
- [ ] Commit.

### Task 4: Worker and narrator

**Files:** create `src/voice/worker.ts`, `src/voice/narrator.ts`; test `tests/unit/voice/narrator.test.ts`.

**Consumes:** `Supertonic`, `parseStyle` (Task 2); `readFile`, `getProfile`, `saveProfile`, `pickSteps` (Task 3).

**Produces:**
- `type VoiceId = 'M2' | 'F1'`.
- `interface Narrator { readonly sampleRate: number; readonly backend: 'webgpu' | 'wasm' | 'fake'; load(): Promise<void>; speak(text: string, lang: Lang, voice: VoiceId): Promise<Float32Array>; destroy(): void }`.
- `class WorkerNarrator implements Narrator { constructor(makeWorker: () => WorkerLike) }` — request ids, one promise per request, errors rejected as `Error(message)`.
- `class FakeNarrator implements Narrator { constructor(options?: { msPerChar?: number; sampleRate?: number }) }` — after `text.length * msPerChar` ms (default 2) returns silence lasting `text.length * 0.06` s.
- `isDeviceLost(error: unknown): boolean` (message matches `/device (is )?lost/i`).
- Worker protocol: in `{ id, type: 'load' }`, `{ id, type: 'speak', text, lang, voice }`, `{ id, type: 'probe', model: ArrayBuffer }`; out `{ id, type: 'ready', sampleRate, backend, steps }`, `{ id, type: 'audio', samples }` (transferred), `{ id, type: 'error', message }`.
- Worker load: imports `${BASE}ort/1.30.0/ort.webgpu.min.mjs`, sets `env.wasm.wasmPaths` to that folder and the thread count; picks the backend; self-tests at 8 steps on `'Buongiorno, oggi leggiamo insieme un racconto.'` when there is no profile or its backend differs; saves the profile. `probe` creates a session from the given model on wasm and runs it once (used by Task 6's e2e).

- [ ] Tests with a fake `WorkerLike`: `load` resolves with the worker's `ready` values; two `speak` calls answered out of order resolve to the right samples; an `error` reply rejects only its own request; `destroy` terminates the worker and rejects pending calls; `FakeNarrator` gives `text.length * 0.06 * sampleRate` samples; `isDeviceLost(new Error('Device is lost'))` true, `isDeviceLost(new Error('out of memory'))` false.
- [ ] Run: fails; implement; passes. `npm run typecheck` passes with the worker file.
- [ ] Commit.

### Task 5: Serving onnxruntime-web

**Files:** `package.json` (`onnxruntime-web` exactly `1.30.0` in dependencies); create `scripts/vite-ort.ts`; modify `vite.config.ts` (plugin; workbox `runtimeCaching` CacheFirst for `/ort/` into `copista-voice-v1`).

**Produces:** `ort/1.30.0/ort.webgpu.min.mjs`, `ort/1.30.0/ort-wasm-simd-threaded.asyncify.mjs`, `ort/1.30.0/ort-wasm-simd-threaded.asyncify.wasm` under the base path, in dev (middleware from `node_modules/onnxruntime-web/dist`) and in the build (`emitFile` in `generateBundle`).

- [ ] Run `npm run build`: `dist/ort/1.30.0/` holds the three files with the same sizes as in `node_modules`; `dist/sw.js` does not list them in its precache manifest; the main bundle does not contain `onnxruntime`.
- [ ] `npm run check-licenses` (or the repo's licence script) passes with ORT's dependency tree.
- [ ] Commit Tasks 4 and 5 together if the worker cannot typecheck without the dependency.

### Task 6: Isolation and CSP

**Files:** create `public/coi.js`; modify `vite.config.ts` (workbox `importScripts: ['coi.js']`), `index.html` (CSP per Global constraints); create `tests/fixtures/identity.onnx` (a one-node Identity model, float32 `[1]`, made once with `uv run --with onnx`); test `tests/e2e/offline.spec.ts` (offline project, production build on port 4176).

**Produces:** navigations answered by the service worker carry `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` only when `caches.has('copista-voice-v1')`; the cached `index.html` is used, the network otherwise.

- [ ] e2e: without the voice cache, after a reload `crossOriginIsolated` is false; after `caches.open('copista-voice-v1')` and a reload it is true; with isolation on, the sample book opens in the Lectorium with its cover picture loaded and Print opens its preview. (The `probe` check moved to Task 7: the worker is in the build only once the app creates it.)
- [ ] Run `npx playwright test --project=offline`: fails; implement; passes.
- [ ] Commit.

### Task 7: The Auditorium

**Files:** modify `src/ui/route.ts`, `src/ui/rooms.ts` (fifth room `auditorium`, name Auditorium, action Listen, after archivum; the comment says keys 1 to 5), `src/ui/App.svelte` (keys `'012345'`), `src/ui/Home.svelte` (a fifth door), `src/rooms/archivum/index.ts` (`Settings.voice: VoiceId`, default `'M2'`, other values ignored); create `src/rooms/auditorium/index.ts`, `src/ui/Auditorium.svelte`, `src/voice/index.ts`, `public/voice/lector.webm`, `public/voice/lectrix.webm`, `public/licences/openrail-m.txt` (the LICENSE uploaded to the model repo), `public/licences/notices.txt` (MIT notices of Supertonic's code and onnxruntime-web, and the fp16 note from the model card); tests `tests/unit/rooms/auditorium.test.ts`, `tests/unit/rooms/archivum.test.ts`, `tests/unit/ui/route.test.ts`, `tests/e2e/app.spec.ts`.

**Produces:**
- `src/voice/index.ts`: `interface VoiceService { isInstalled(); install(onProgress, signal?); remove(); spaceUsed(); narrator(): Narrator }`; `voiceService(): VoiceService` returns the real one, or a fake (instant install remembered in `localStorage`, `FakeNarrator`) when `import.meta.env.DEV` and `localStorage['copista-test-voice']` is set, so the fake never ships.
- `src/rooms/auditorium/index.ts`: `voiceStatus(): Promise<{ installed: boolean; bytes: number }>`, `installVoice`, `removeVoice`, re-exporting the service calls for the screen.
- Screen, in order: RoomHero; the Lector's introduction; the two samples (`<audio controls>`); "Works best on recent phones and computers."; size (about 227 MB with the engine files) and source (`huggingface.co`); the use restrictions in short with links to the full licence and notices; an "I accept" checkbox that enables Download; progress; once installed, Lector/Lectrix choice, space used and Remove.
- The samples: Italian, about 8 s each, made from the spike page in headless Chromium with MediaRecorder (Opus in WebM), one per voice at 8 steps.

- [ ] Tests: `parseHash('#/auditorium')` and `hashOf` round-trip; key `5` goes to the Auditorium; settings keep `voice: 'F1'` and ignore `voice: 'X1'`; `voiceStatus` with the fake service before and after install; e2e (dev, fake voice): Download is disabled until "I accept", installing shows Remove and the voice choice, Remove brings back Download; the five tabs fit at 320 px without overflow; offline project, isolated: the built voice worker (its file found in the service worker's precache list) answers `probe` with `tests/fixtures/identity.onnx` on wasm, with no CSP error in the console.
- [ ] Run: fails; implement; passes.
- [ ] Commit.

### Task 8: Player

**Files:** create `src/voice/player.ts`, `src/voice/audio.ts`; tests `tests/unit/voice/player.test.ts`, `tests/unit/voice/audio.test.ts`.

**Consumes:** `Narrator`, `Piece`, `Lang`, `VoiceId`.

**Produces:**
- `interface PieceSource { next(): Promise<Piece | null> }` (null at the end of the book).
- `interface AudioSink { play(samples: Float32Array, rate: number): Promise<'ended' | 'stopped'>; pause(): void; resume(): void; stop(): void }`.
- `type PlayerState = 'idle' | 'waiting' | 'playing' | 'paused' | 'ended'`.
- `class Player { constructor(deps: { narrator: Narrator; sink: AudioSink; now: () => number; onState(s: PlayerState): void; onPiece(p: Piece): void }); start(source: PieceSource, voice: VoiceId, lang: Lang): void; pause(); resume(); next(); prev(); setVoice(v); setLang(l); stop() }` — generates ahead up to 120 s; `prev` replays the previous piece from its kept text; `setVoice`/`setLang` drop the buffer and regenerate from the current piece.
- `startThreshold(rtf: number): number` = `0` when `rtf <= 1`, else `min(120, 60 * (1 - 1 / rtf))` seconds: playback (re)starts when that much is buffered, so the next minute plays without a stop. RTF is the mean of the last three pieces.
- `audio.ts`: `encodeWav(samples: Float32Array, rate: number): ArrayBuffer` (16-bit PCM mono); `class ElementSink implements AudioSink` (an `HTMLAudioElement`, one blob URL per piece, revoked after it plays or on stop).

- [ ] Tests (FakeNarrator, a fake sink and clock): pieces play in order and `onPiece` fires as each starts; generation stops at 120 s ahead and resumes as audio plays; a narrator slower than real time gives `'waiting'` then `'playing'` once `startThreshold` is buffered; `startThreshold(0.5) === 0`, `startThreshold(2) === 30`, `startThreshold(4) === 45`; a source returning `null` at once gives `'ended'`; `stop` during generation leaves nothing playing and the sink stopped; `setVoice` regenerates the current piece with the new voice; `encodeWav` of 3 samples at 44100 Hz is 50 bytes, starts `RIFF`, has 44100 at byte 24, and clips 1.5 to 32767.
- [ ] Run: fails; implement; passes.
- [ ] Commit.

### Task 9: Reader hooks and the controller

**Files:** modify `src/reader/paginator.ts` (`ChapterView` and `Paginator`), `src/reader/scroller.ts`, `src/rooms/lectorium/controller.ts`, `tests/harness/lectorium.ts`; tests `tests/e2e/paginator.spec.ts`, `tests/e2e/scroller.spec.ts`, `tests/e2e/lectorium.spec.ts`.

**Produces:**
- `ChapterView` gains `readonly document: Document | null`; `firstVisible(elements: readonly Element[]): number` (index of the first element on the current page or below the top of the screen; -1 when none); `reveal(range: Range): void` (turns to the page holding the range's start, or scrolls it to one third of the height); `highlight(range: Range | null): void` (the `copista-voice` Custom Highlight in the chapter frame, styled in the layout rules; a no-op where `CSS.highlights` is missing).
- `ReadingController` gains `listen(options: { narrator: Narrator; sink: AudioSink; voice: VoiceId; lang: Lang; onState(s: PlayerState): void }): void`, `stopListening(): void`, `get listening(): boolean`, and `voice(v)`, `lang(l)`, `skip(1 | -1)`, `pauseListening()`, `resumeListening()`. Its `PieceSource` starts at `firstVisible(readableBlocks(view.document))` and reads on into later chapters, taking their text from `DOMParser` on `buildSrcdoc` before they are shown. Each piece played calls `reveal` and `highlight` once its chapter is on screen (opening it when needed). `listen` pauses autoscroll; `play()` stops listening. A hand turn (`next`, `prev`, `goTo`) while listening restarts at the new page.

- [ ] e2e (harness, FakeNarrator, a fake sink): listening from page 3 starts with the first block on page 3; the highlighted text equals the playing piece; when a piece lies on the next page the paginator turns to it; in scroll mode the piece is scrolled into view; a picture-only chapter is skipped; at the end of a chapter the next opens and reading goes on; `play()` while listening stops listening, and `listen` while autoscrolling stops the motion; a hand `next()` restarts at the new page.
- [ ] Run `npx playwright test tests/e2e/paginator.spec.ts tests/e2e/scroller.spec.ts tests/e2e/lectorium.spec.ts`: fails; implement; passes (Chromium and WebKit).
- [ ] Commit.

### Task 10: The Listen tool and bar

**Files:** modify `src/ui/Lectorium.svelte`; test `tests/e2e/lectorium.spec.ts` (dev app, fake voice).

**Produces:** a seventh tool, Listen (`listen-toggle`, `aria-pressed`), shown only when the voice is installed; a Listen bar with play/pause, previous, next, Lector/Lectrix and IT/EN (the book's language first), showing "The Lector is catching up…" in `'waiting'` and "End of the book" in `'ended'`; Media Session metadata (book title, Lector or Lectrix) with play and pause handlers; the voice choice saved in settings.

- [ ] e2e: no Listen tool before installing; after installing from the Auditorium it appears; pressing it shows the bar and highlights text; pause and play toggle; Autoscroll stops listening and Listen stops autoscroll; leaving the room stops the audio; the toolbar fits at 320 px with seven tools.
- [ ] Run `npx playwright test`: everything passes.
- [ ] Run the commit checks (`npm run lint`, `npm run typecheck`, `npm test -- --coverage`).
- [ ] Commit.

### After the tasks

- Manual on the phone (not in CI): install from a local HTTPS build, listen with the screen off, check the self-test chose 8 on the Reno 15.
- Section 8's licence check against the licence text before release.

## Self-review

- Spec coverage: engine and call settings (Tasks 2, 4); fallback and self-test (4); store, persistence, removal (3); hosting URL and CSP (3, 6); isolation (6); text rules (1); start, follow, highlight, next chapter (9); buffer and catching up (8); Listen tool, bar, exclusivity, Media Session (10); Auditorium, samples, licence step, disclaimer (7); layering (1); tests in section 12 (1, 3, 8, 9, 10). The Licences page of section 8 is two text files linked from the Auditorium.
- Spec correction made with this plan: section 3 gave "roughly 10 to 20 MB" for the onnxruntime files; the files chosen are about 27 MB, so the whole voice is about 227 MB.
- Types: `Piece`, `Lang`, `VoiceId`, `Narrator`, `PlayerState`, `PieceSource`, `AudioSink`, `Profile` are each defined once and used with the same names later.
