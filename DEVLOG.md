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
