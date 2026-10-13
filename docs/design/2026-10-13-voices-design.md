# Read aloud: the Lector and the Auditorium

Status: approved 2026-10-13; phase 0 done the same day. Not part of the 2026-10-14 launch.

## 1. Goal

Copista reads a book aloud in a natural neural voice, in Italian and English, entirely in the
browser. A single narrator figure, the **Lector**, gives the feature a face in keeping with the
Latin rooms. The voice is an optional download; nothing about reading changes for people who
never fetch it.

What Giuseppe decided by ear (four rounds of samples, 2026-10-13):

- Engine: Supertonic 3. Piper's Italian was poor, and Kokoro is too slow without WebGPU.
- Settings: 8 steps and speed 1.05. At speed 0.95 the intonation was worse, and 16 steps were
  slower than real time.
- Voices: M2 (male) and F1 (female). The other styles sounded foreign in Italian.
- Weights: full precision. int8 is clearly worse. Our fp16 copy (200 MB) was accepted by ear.
- Text: no stress marks. Plain text gave the best samples, and the penultimate-syllable rule
  made it worse. Marking a few proparoxytones (_dìcono_) helped slightly, which leaves room
  for a tiny hand-made list later. It is not in this design.

Giuseppe delegated the remaining choices. Each choice I made is listed in section 11 so it can
be overridden.

## 2. Scope

In:

- one engine with two voices;
- the book's language, with a quick switch between Italian and English;
- reading from the current page onwards, with the passage being read highlighted and the pages
  following along;
- lock-screen play and pause controls;
- the download, removal and licence notice;
- the Auditorium room.

Out:

- stress marking;
- exporting audio files;
- a sleep timer;
- per-book voice memory;
- reading notes aloud;
- languages other than the book's own and the IT/EN switch.

## 3. Engine

- **Model.** Supertonic 3 by Supertone Inc. The code is MIT. The weights are under OpenRAIL-M,
  with use restrictions in its Attachment A. The model reads characters, normalised with NFKD
  through `unicode_indexer.json`. It does not need eSpeak, so no GPL code enters the app.
- **Files.** These are our fp16 conversion. Each weight is stored in half precision and cast
  back to fp32 when the model loads, so all computation stays fp32.

  | File | Size |
  | --- | --- |
  | `vector_estimator.onnx` | 128.7 MB |
  | `vocoder.onnx` | 50.8 MB |
  | `text_encoder.onnx` | 18.5 MB |
  | `duration_predictor.onnx` | 2.0 MB |
  | `tts.json`, `unicode_indexer.json`, two voice styles | small |
  | **Total** | **about 200 MB** |

  The onnxruntime-web wasm files (MIT, roughly 10 to 20 MB) are served from copista.org. The
  browser fetches them on demand; they are not precached.
- **Call.** `tts.call(text, lang, style, 8, 1.05, 0.3)` runs in a dedicated Worker. Its
  helper is adapted from Supertonic's `web/helper.js` and keeps the MIT notice.
- **Behind an interface.** The app talks to `Narrator.speak(text, lang, voice) → Float32Array`
  at the model's sample rate. Tests use a fake narrator, so CI never downloads 200 MB.

## 4. Speed, measured

Measurements were taken on Giuseppe's PC (16 cores) in headless Chromium, with the wasm
backend, fp16 weights and 8 steps. The test text was a 13.5-second Manzoni sentence. RTF is
computing time divided by audio time: below 1 the voice keeps up with the listener.

| Setting | Load | RTF |
| --- | --- | --- |
| 1 thread | 2.6 s | 1.06 |
| 4 threads | 2.7 s | 0.59 |
| 1 thread, CPU slowed 4× | 11.0 s | 5.50 |
| 4 threads, CPU slowed 4× | 13.1 s | 3.17 |

A CPU slowed fourfold is only a rough stand-in for a phone, but the conclusions are firm:

1. **Several threads are required.** Threads in wasm need `SharedArrayBuffer`, which needs a
   cross-origin isolated page (COOP and COEP headers). GitHub Pages cannot send custom headers.
   The service worker will therefore add them to the navigation response; this is the
   `coi-serviceworker` technique.
   - COEP will be `require-corp`. The app loads nothing cross-origin except the model fetch,
     which is a CORS request and is allowed.
   - The page is isolated only once the service worker controls it. Setting up the voice
     therefore ends with one reload.
   - If isolation fails, the narrator runs on one thread. It still works, but it is slow.
2. **A phone may not keep up at 8 steps.** Phase 0 (section 10) measured this on two real
   phones. By ear, 8 steps are very good, 6 are acceptable, and 4 are rejected for both
   quality and intonation, so the narrator never goes below 6.

### Phase 0 on two phones

Same Manzoni sentence, fp16 weights, Chrome on Android, served over HTTPS on the home Wi-Fi.

| Phone | Backend | 8 steps | 6 steps | 4 steps |
| --- | --- | --- | --- | --- |
| Reno 15 (Chrome 154, 8 cores) | wasm, threaded | 1.25–1.86 | 1.09–1.55 | 0.76–1.02 |
| Reno 15 | WebGPU | 0.35 | 0.27 | 0.20 |
| An older phone (Chrome 155) | wasm, threaded | 3.85–4.16 | 2.94–3.22 | 2.07–2.34 |
| An older phone | WebGPU | failed ("Device is lost") | | |

- Loading took 26–31 s on the Reno 15, download included.
- On the Reno 15, continuous reading on WebGPU at 8 steps went on with the screen off:
  generation slowed to about RTF 0.66 and playback never stopped. Lock-screen controls worked.
- On the older phone, WebGPU was lost during the first run, and afterwards the browser gave no
  WebGPU adapter at all.

### Rules that follow

- **WebGPU first.** On phones only WebGPU keeps up. The narrator asks for WebGPU and uses the
  threaded wasm backend where WebGPU is missing.
- **Fall back on loss.** If WebGPU is lost while speaking, the worker reloads the model on wasm
  and repeats the sentence. That device stays on wasm for the rest of the session.
- **Steps by self-test.** When the model first loads, the worker times one short sentence at 8
  steps. If its RTF is below 0.8, it keeps 8 steps; otherwise it uses 6. The result is stored
  with the voice and measured again when the backend changes.
- **The voice is offered on every device.** Giuseppe chose this over hiding it on slow phones.
  The Auditorium says "Works best on recent phones and computers." before the download. On a
  device that cannot keep up, reading pauses while the Lector catches up (section 6).
- **Longer pieces, fewer calls.** Each call to the model has a fixed cost, and a short
  sentence spoken alone gets a flat intonation. The narrator therefore joins consecutive
  sentences of one block into pieces of up to 300 characters, the helper's own limit, and
  highlights the whole piece.
- **Lean helper.** The helper is rewritten with typed arrays throughout, instead of nested JS
  arrays, so less time goes into copying between calls.

## 5. Hosting and download

**Hosting.** The model is too big for GitHub Pages:

- one file (129 MB) is over Pages' 100 MB file limit;
- at 200 MB per person, Pages' soft bandwidth limit of 100 GB a month covers only about 500
  downloads.

The files therefore go in a **Hugging Face model repository** under Giuseppe's account. Its
model card carries the OpenRAIL-M licence, Attachment A, and a note that the weights were
converted to fp16 by us. The app fetches from a URL pinned to one commit of that repository.

**Content Security Policy.** `connect-src` gains `https://huggingface.co https://*.hf.co`.
Phase 0 recorded these from a real download: a file URL on `huggingface.co` redirects to
`huggingface.co/api/resolve-cache/...` and then to `us.aws.cdn.hf.co`. The repository is
`GiuseppeSPk/copista-voice`, pinned to commit `cddb9ee79954ec63e65ebc147464b0610b648c2c`. This
is the first time Copista fetches anything from another site. The download
dialog names the site, and the app sends nothing but the request.

**Download.** Each file is fetched with visible progress and checked against a SHA-256 written
in the app. It is then stored in Cache Storage under `copista-voice-v1`, and the app asks for
persistent storage. A file that fails its check is deleted and fetched again once. Removing
the voice deletes that cache and frees the space shown on screen.

## 6. Listening

**Text.** The text comes from the chapter document already open in the reader.

- Read: `p`, `h1`–`h6`, `li`, `blockquote`, `dt`, `dd` and `figcaption`, in document order.
- Skip: note lists (`ol.notes` and `ol.footnotes`), note reference marks (`sup > a`), `pre`,
  and pictures.
- Each block is split into sentences with `Intl.Segmenter(lang, { granularity: 'sentence' })`.
  Consecutive sentences of one block are joined into pieces of up to 300 characters (section
  4). A single sentence over 300 characters is split at commas, then at spaces.

**Start and follow.** Reading starts at the first block visible on the current page, or at the
top of the screen in scroll mode.

- The piece being spoken is highlighted with the CSS Custom Highlight API where it exists,
  and simply not highlighted where it does not.
- The view turns the page, or scrolls, so that piece stays on screen.
- Turning the page by hand while listening restarts the reading at the new page.
- At the end of a chapter, the reading goes on into the next one.

**Generation ahead.** The worker synthesises pieces ahead of the one being played, up to
about two minutes of audio. Played audio is dropped, so memory stays bounded: two minutes at
44.1 kHz in fp32 is about 21 MB.

- When the listener catches up with the worker, playback waits, and the bar shows "The Lector
  is catching up…".
- On a slow device, playback starts only once the buffer holds enough audio to cover the
  expected wait.

**Controls.**

- A seventh reader tool, **Listen**, appears only once a voice is installed. It must fit a
  320 px wide phone, as the other six do.
- Listening and auto-scroll are exclusive: starting one stops the other.
- The Listen bar holds play/pause, previous and next piece, the voice (Lector or Lectrix),
  and the language. The language shows the book's language and switches between IT and EN.
- The Media Session API puts play and pause on the lock screen.
- Audio and generation carry on with the screen off (phase 0, on WebGPU). Generation slows
  down there, which the buffer absorbs.

## 7. The Lector and the Auditorium

**Persona.** The narrator is the **Lector**. Its female voice is the **Lectrix**, the Latin feminine
of lector.

- I set aside _anagnostes_. In Rome that reader was usually an enslaved member of the
  household (Cicero's Sositheus), which is not a figure to put on a launch poster.
- "Lector" sits naturally next to the Lectorium: there you read, here someone reads to you.

**Auditorium.** The Auditorium is a fifth room, after the Archivum. It is the voice's home:

- the Lector's short introduction in the app's own words;
- two pre-recorded samples, M2 and F1, shipped as small audio files (about 20 KB each in Opus),
  so people hear the voice before downloading 200 MB;
- the download, with its size, source and progress;
- the licence notice and an "I accept" step;
- the voice choice;
- the space used, and a Remove button.

The listening itself happens in the Lectorium, with the book on screen. The tabs must still
fit at 320 px with five rooms.

## 8. Licence

- **Before downloading.** The Auditorium shows the OpenRAIL-M use restrictions, and the
  download needs an explicit "I accept".
- **Inside the app.** A Licences page carries the full OpenRAIL-M text, the MIT notices for
  Supertonic's code and onnxruntime-web, and the note on our modification. The same material
  sits on the Hugging Face model card.
- **Check first.** Before release, I will read the licence's exact obligations for
  redistributing modified weights from the licence text itself and check them against this
  plan. They are not quoted from memory here.

## 9. Units

| Unit | Responsibility |
| --- | --- |
| `src/voice/narrator.ts` | The `Narrator` interface; the Supertonic narrator that talks to the worker; the fake narrator for tests |
| `src/voice/worker.ts`, `src/voice/supertonic.ts` | Loading the model and running `tts.call`, in the worker |
| `src/voice/store.ts` | Download, SHA-256 check, Cache Storage, persistence, removal, space used |
| `src/voice/text.ts` | Blocks and sentences from a chapter document, as pure functions |
| `src/voice/player.ts` | Generation buffer, playback, Media Session, catching-up state |
| `src/reader/` | `ChapterView` gains: the first visible block, showing a given element, and highlighting a range |
| `src/rooms/auditorium/` | The room's operations |
| `src/ui/Auditorium.svelte` | The room's screen |
| `src/ui/Lectorium.svelte` | The Listen tool and the Listen bar |
| Service worker | COOP/COEP headers on navigations (`importScripts` in the workbox config) |
| `index.html` | `connect-src` hosts |

`voice` sits beside `reader` in the layering: it depends on `core` only. The existing
layering test is extended to cover it.

## 10. Phases

0. **Measure on the phone** (done 2026-10-13; results in section 4). Serve the spike over local HTTPS on the
   Wi-Fi and have Giuseppe open it on his phone. It records:
   - load time and RTF for wasm (with threads) and WebGPU, at 8, 6 and 4 steps;
   - whether playback survives the screen turning off.

   In the same phase:
   - Giuseppe hears samples at 8, 6 and 4 steps (done: 6 is the floor);
   - the Hugging Face repository is created (with his OK) and a real download records the CDN
     hosts.

   **Gate:** passed. WebGPU keeps up on a recent phone, and the voice is offered on every
   device with a note that it works best on recent ones.
1. **Engine and store.** The worker, the narrator, the download with checks, isolation through
   the service worker, and the CSP.
2. **Auditorium.** The room, the samples, the licence step, download and removal.
3. **Listening.** Text extraction, the generation buffer, following and highlighting, the
   Listen tool and bar, and the Media Session.

## 11. Choices I made (override any)

- Hugging Face for hosting, instead of chunked files on GitHub Pages.
- The names Lector and Lectrix; _anagnostes_ set aside.
- The Auditorium as a fifth room for setup only, with listening in the Lectorium.
- Pre-recorded samples shipped with the app.
- A buffer of about two minutes; no exporting or storing of generated audio.
- The language switch limited to the book's language, IT and EN.
- The self-test threshold: 8 steps when RTF is below 0.8, which leaves room for the screen
  being off and for other work in the page.
- Pieces of up to 300 characters, highlighted as a whole, rather than one sentence at a time.

## 12. Testing

- **Unit:**
  - block and sentence extraction, using Italian and English chapters with notes, lists and
    headings;
  - store behaviour with a corrupted file and a failed fetch;
  - buffer and catching-up logic, with a fake narrator and a fake clock.
- **e2e (fake narrator):**
  - the Auditorium flow;
  - the Listen tool appears only after installation;
  - the highlight moves and the page turns;
  - auto-scroll and listening exclude each other;
  - the toolbar and tabs fit at 320 px.
- **Manual, not in CI:** real model quality and speed, using the phase 0 page.
