# Copista

Convert documents and read books in the browser. Nothing leaves your device.

**Open it at <https://copista.org/>.**

Copista is a web app that you can install and use offline. It has four rooms:

- **Bibliotheca**, the library: add EPUB books and keep them in this browser,
  or find free classics in Standard Ebooks, Project Gutenberg, Wikisource and
  Liber Liber.
- **Lectorium**, the reading room: pages that turn like a book, or one long
  column that scrolls by itself at a reading pace you set. Contents, bookmarks,
  notes, text size and page colours. It remembers where you stopped.
- **Scriptorium**, the conversion room:
  - any of EPUB, Word (.docx), Markdown and plain text to any other, or to a
    single web page;
  - any of them to PDF through the browser's print dialog ("Save as PDF").
- **Archivum**, data and privacy: reading settings, space used, and a button
  that deletes everything Copista has stored.

Copista is young (version 0.1). Bug reports and ideas are welcome as issues.

## Privacy

There is no account, no server-side processing, no analytics and no cookies.
Books, reading positions, bookmarks, notes and settings are stored in the browser's
IndexedDB on your device. Files you convert are read in memory and not kept.
See [PRIVACY.md](PRIVACY.md).

## Limits

- Books protected by DRM cannot be opened.
- There is no PDF to EPUB conversion: doing it well needs layout analysis.
- PDF output goes through the print dialog, so the result depends on the
  browser.
- Fixed-layout EPUBs open, but the reader is designed for reflowable books.

## Development

Node 22 or later.

```sh
npm install
npm run dev          # http://localhost:5175
npm run lint
npm run typecheck
npm test             # unit tests; add -- --coverage for the coverage gate
npm run test:e2e     # Playwright, Chromium and WebKit, plus an offline test
npm run build        # production build in dist/
npm run licenses     # checks the licenses of runtime dependencies
```

The code is split into layers. `src/core` holds the formats (EPUB, .docx,
Markdown, HTML) and has no browser storage. `src/reader` holds the paginator.
`src/storage` holds the IndexedDB database. `src/rooms` has one service module
per room. `src/ui` holds the Svelte interface. A unit test checks that the
layers only import in the allowed direction and that rooms do not import each
other.

`docs/design/` holds the design and the engine plan. `DEVLOG.md` records
decisions and measurements.

## Clean room

Copista is written from public specifications and library documentation, without
looking at the code of other e-book software. [CLEANROOM.md](CLEANROOM.md)
lists the rules and every source consulted.

## Support

Copista is free. If it is useful to you, a star on GitHub helps others find it,
and you can [buy me a coffee on Ko-fi](https://ko-fi.com/giuseppespk).

## License

MIT. See [LICENSE](LICENSE).
