# Devlog

## 2026-10-08

- Wrote the design: a browser-only e-book reader and converter built around a
  single internal `Book` model. Every input becomes a `Book`; every output
  starts from one.
- Chose a name. "Scriptoria" was the first idea; a search showed it was crowded,
  so the project became **Copista** (Italian for the monk who copied books).
  The user interface is organised as the rooms of a monastery: Bibliotheca
  (library), Lectorium (reading room), Scriptorium (convert) and Archivum
  (settings and privacy).
- Dropped PDF to EPUB from the scope: few people need it and it cannot be done
  well without layout analysis.
- Decided to build and test the engine before any interface. Each room gets its
  own service module, and a test keeps the layers apart.
- Switched the test DOM from happy-dom to jsdom: the EPUB reader needs strict
  XML parsing that reports malformed files.
- Finished the engine: reading, writing, conversions, storage and the four room
  services, with no interface yet. Measured on this machine:
  - Unit tests: 31 files, 156 tests, all passing. Coverage of `core`, `reader`,
    `storage` and `rooms`: 94.3% of lines, 81.0% of branches. CI now fails
    below 90% of lines or 80% of branches. The paginator and the reader
    controller are left out of that count because they need a real layout
    engine; the browser tests cover them.
  - Browser tests (Playwright): 60 tests each in Chromium and WebKit, 120
    passing.
  - Real books: 25 of 25 public-domain EPUBs from the corpus read correctly.
  - EPUBCheck 5.4.0: 44 EPUBs written by the engine, from the fixtures and the
    corpus, all with 0 errors and 0 warnings.
  - A 20 MB generated book opens in 264 ms in Chromium and 386 ms in WebKit
    (the target is under 5 seconds).
- Weakest spots by coverage: image size detection (60% of lines), and the
  branches of the Markdown writer (35%), the .docx reader (65%) and the XHTML
  helpers (50%). These are the first places to add tests.
- Caught a flaky test while turning on coverage: the fixture zips stored the
  current time, so the same fixture built a second apart had a different hash
  and the duplicate-book check failed now and then. The zips now carry a fixed
  date, and a test builds a fixture under two different clocks and compares
  the bytes.

## 2026-10-09

- Built the beta interface in Svelte 5: one component per room, sharing a small
  state module. The styling is plain on purpose; the visual design comes later.
- Made the app installable and usable offline: icons drawn by a script, a web
  manifest and a service worker that caches the app files. A content security
  policy blocks every request outside the site.
- Added the privacy text in the Archivum and in `PRIVACY.md`, the README, and
  a GitHub Pages workflow that builds under `/<repository>/`.
- Kept "PDF (print)" for PDF output: it opens the browser's print dialog.
  Writing PDF files directly is still an open decision.
- Bugs found by the browser tests and screenshots, all fixed:
  - the arrow keys did not turn the page while a toolbar button had focus;
  - the reading page was about 300 px tall, because the room was a grid whose
    last row only filled when an error was shown;
  - the space before the chapter name in the page counter was dropped;
  - the cover placeholder text failed the colour contrast check.
- Measured on this machine:
  - Unit tests: 33 files, 185 tests, all passing; 94.4% of lines and 81.6% of
    branches.
  - Browser tests: 167 passing, Chromium and WebKit plus the offline test,
    which adds a book, cuts the network, reloads, reads and converts.
  - axe finds no serious or critical problems in any room.
  - Production bundle: 536 kB of JavaScript (178 kB gzipped) in one file.
    Vite warns about chunks over 500 kB. Loading the .docx reader only when a
    conversion needs it is the first thing to try.
- Known flakiness: two of four full browser-test runs had WebKit failures
  where the test could not reach the dev server under parallel load on
  Windows. The same tests pass alone, repeated. Not hidden with retries.

## 2026-10-09, later

- The .docx reader (mammoth) is now its own chunk, loaded only when a .docx is
  converted. The main bundle went from 536 kB (178 kB gzipped) to 229 kB
  (83 kB gzipped); the .docx chunk is 310 kB (96 kB gzipped). Vite no longer
  warns, and the raised service worker cache limit is gone. The offline test
  now converts a .docx too, which fails if that chunk is not cached.
- The Scriptorium can convert a book already in the library, to any format but
  EPUB, without choosing the file again.
- `npm audit` reports three moderate findings, all in sprintf-js through
  argparse, which mammoth needs only for its command-line tool. Neither
  package is in the built app, and the advisory lists no fixed version.
- Measured on this machine:
  - Unit tests: 33 files, 187 tests, all passing; 94.4% of lines and 81.6% of
    branches.
  - Browser tests: 169 passing.
  - The WebKit failures noted above did not come back in six full runs.
