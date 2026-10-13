# Copista engine: implementation plan

**Goal:** Build and fully test Copista's headless engine (EPUB reading and writing, every conversion, pagination logic, storage) and one service module per room, before any user interface exists.

**Architecture:** Every input becomes a `Book` (`src/core/model`), every output starts from a `Book`. Layers depend downward only: `core` ← `reader`, `storage` ← `rooms/<room>`. Each room (Bibliotheca, Lectorium, Scriptorium, Archivum) is a self-contained service module that the Svelte UI (a later plan) will call; rooms never import each other. An architecture test enforces this.

**Tech Stack:** TypeScript (strict), Vite, Vitest + jsdom, fflate, mammoth, marked, turndown, DOMPurify, idb, fake-indexeddb, Playwright (Chromium + WebKit), EPUBCheck (Java 21, local and CI).

**Spec:** `docs/design/2026-10-08-design.md`

**Out of this plan (next plan, "rooms UI"):** Svelte, the four room screens, PWA and offline, icons and illustrations, deploy workflow, README, PRIVACY.md, screenshots, axe checks, the app-wide "zero third-party requests" test.

## Global Constraints

- Node 22, npm, `"type": "module"`, TypeScript `strict: true` and `noUncheckedIndexedAccess: true`.
- Runtime dependencies are exactly: `fflate`, `mammoth`, `marked`, `turndown`, `dompurify`, `idb`. Dev dependencies: `typescript`, `vite`, `vitest`, `@vitest/coverage-v8`, `jsdom`, `fake-indexeddb`, `@playwright/test`, `eslint`, `typescript-eslint`, `prettier`, `tsx`, `@types/turndown`. Anything else needs the owner's OK.
- Allowed licenses for every runtime package, transitive included: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, and SPDX `OR` expressions containing one of these.
- `core/` never touches the network, IndexedDB or `window` beyond `DOMParser`/`document` for parsing.
- Book keys: every internal reference stored in a `Book` (chapter `href`, attributes in `Chapter.html`, `url()` in CSS) is a **book key**: a normalized, percent-decoded zip path with no leading slash, optionally followed by `#fragment`. External references keep their scheme (`https:`, `mailto:`).
- Typed errors only from `src/core/errors.ts` and `src/storage/db.ts`; no bare `throw new Error` for user-facing failures.
- Clean room: do not open the source of other e-book readers or converters (Calibre, Foliate, epub.js, Readium, pandoc). Allowed sources: W3C EPUB 3.3, EPUB Reading Systems 3.3, OCF 3.3, IDPF OPF 2.0.1 and NCX, ECMA-376 Part 1, CommonMark, MDN, and each library's own documentation. Add every source actually used to `CLEANROOM.md`.
- If a choice looks risky for copyright or trademark, stop and ask the owner.
- Repo files, code and commits in English. Commit messages copy the repo style: one short imperative sentence, capitalized, no prefix, no trailer, no emoji, no attribution (`Add design spec`).
- No local absolute paths in any committed file.
- Never `git push` or create the GitHub repository. CI files are written now and run once the owner creates the remote.
- A failing test is reported with its output; tests are never skipped, weakened or deleted to get green.
- DEVLOG.md: add a dated entry whenever a task changes a spec decision or catches a mistake made by the AI.

## Review Focus

1. **Very large books** (hundreds of chapters, a 20 MB image): expected to open in seconds without crashing. Test in Task 6 (jsdom) and Task 8 (real browsers).
2. **Text files not in UTF-8** (Windows-1252, UTF-16 with BOM, UTF-8 with BOM): expected to show the right characters, not mojibake. Test in Task 11.
3. **XHTML with HTML named entities** (`&nbsp;`, `&eacute;`) under an XHTML 1.1 DOCTYPE, very common in EPUB 2: expected to keep the characters. Test in Task 6 (`epub2Entities`).
4. **Manifest or spine entries whose file is missing from the zip:** expected to open with the missing parts skipped and a warning. Test in Task 6 (`missingFiles`).
5. **Browser storage full during import:** expected a `StorageFullError` stating the bytes needed, and the library left unchanged. Test in Task 18 and Task 19.

---

## File structure

```text
src/core/model/book.ts        Book, Chapter, TocEntry, Resource, BookWarning, BookMeta
src/core/model/position.ts    Position
src/core/errors.ts            CopistaError and the typed errors
src/core/hash.ts              sha256Hex
src/core/paths.ts             resolveHref, relativeHref
src/core/refs.ts              mapHtmlRefs, mapCssUrls
src/core/sanitize.ts          sanitizeHtml, sanitizeCss
src/core/epub/zip.ts          openZip, readText
src/core/epub/xml.ts          parseXml, parseXhtml
src/core/epub/drm.ts          detectDrm
src/core/epub/package.ts      parsePackage (OPF)
src/core/epub/toc.ts          parseNav, parseNcx, tocFromHeadings
src/core/epub/read.ts         readEpub
src/core/epub/xhtml.ts        htmlToXhtml
src/core/epub/write.ts        writeEpub
src/core/convert/detect.ts    detectFormat, InputFormat
src/core/convert/decode.ts    decodeText
src/core/convert/build.ts     bookFromSections, splitByHeading
src/core/convert/from-txt.ts  fromTxt
src/core/convert/from-md.ts   fromMarkdown, parseFrontMatter
src/core/convert/from-docx.ts fromDocx
src/core/convert/to-text.ts   toText
src/core/convert/to-md.ts     toMarkdown
src/core/convert/to-html.ts   toHtml
src/core/convert/image-size.ts imageSize
src/core/convert/to-docx.ts   toDocx
src/reader/location.ts        page/fraction maths, bookPercent, clampPosition, chapterForHref
src/reader/resources.ts       ResourceUrls (book key -> blob: URL)
src/reader/render.ts          buildSrcdoc, ReaderLook, Theme
src/reader/paginator.ts       Paginator (browser only)
src/storage/db.ts             IndexedDB access, StorageFullError, BookNotFoundError
src/rooms/bibliotheca/index.ts importBook, listShelf, removeBook
src/rooms/lectorium/index.ts   openSession, savePosition, bookmarks, progressPercent
src/rooms/lectorium/controller.ts ReadingController (browser only)
src/rooms/scriptorium/index.ts inspect, convert, convertBook
src/rooms/archivum/index.ts    settings, storageUsage, deleteAllData
scripts/architecture.ts       findViolations (used by the architecture test)
scripts/make-fixtures.ts, fetch-corpus.ts, write-outputs.ts, epubcheck.ts, check-licenses.ts
tests/setup.ts                Node Blob/File/crypto on globalThis
tests/fixtures/               builders, catalog, expectations (CC0)
tests/unit/                   Vitest, mirrors src/
tests/corpus/                 corpus test (own Vitest config)
tests/harness/                plain HTML pages for Playwright
tests/e2e/                    Playwright specs
```

This refines spec section 9: room services live in `src/rooms/`, and `src/ui/` (later) is a thin layer over them. Task 1 records this in the spec.

---

### Task 1: Tooling, CI and layer rules

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `index.html`, `src/main.ts`, `tests/setup.ts`, `scripts/architecture.ts`, `scripts/check-licenses.ts`, `.claude/commit-checks`, `.github/workflows/ci.yml`, `LICENSE`, `DEVLOG.md`, `CLEANROOM.md`
- Modify: `.gitignore` (add `.cache/`, `tests/fixtures/output/`), `docs/design/2026-10-08-design.md` (sections 5, 7, 9)
- Test: `tests/unit/environment.test.ts`, `tests/unit/architecture.test.ts`

**Interfaces:**
- Produces: npm scripts `typecheck`, `lint`, `format`, `test`, `test:e2e`, `test:corpus`, `fixtures`, `epubcheck`, `licenses`; `findViolations(files: Record<string, string>): string[]`.

- [ ] **Step 1: Install and configure.** `npm init -y`, then the dependencies from Global Constraints at their latest stable versions (the lockfile records them). Scripts: `"typecheck": "tsc --noEmit"`, `"lint": "eslint . && prettier --check ."`, `"format": "prettier --write ."`, `"test": "vitest run"`, `"test:e2e": "playwright test"`, `"test:corpus": "tsx scripts/fetch-corpus.ts && vitest run -c vitest.corpus.config.ts"`, `"fixtures": "tsx scripts/make-fixtures.ts"`, `"epubcheck": "tsx scripts/write-outputs.ts && tsx scripts/epubcheck.ts"`, `"licenses": "tsx scripts/check-licenses.ts"`. `vitest.config.ts`: environment `jsdom`, `setupFiles: ['tests/setup.ts']`, include `tests/unit/**/*.test.ts`. `tests/setup.ts` assigns Node's `Blob`, `File` and `webcrypto` to `globalThis` (jsdom's own Blob lacks `arrayBuffer()`).

- [ ] **Step 2: Write the environment test** (`tests/unit/environment.test.ts`). It pins what `core/` needs from the test DOM:

```ts
it('parses namespaced XML', () => {
  const doc = new DOMParser().parseFromString(
    '<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>T</dc:title></metadata></package>',
    'application/xml');
  expect(doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0]?.textContent).toBe('T');
});
it('reports malformed XML with a parsererror element', () => {
  const doc = new DOMParser().parseFromString('<a><b></a>', 'application/xml');
  expect(doc.getElementsByTagName('parsererror').length).toBeGreaterThan(0);
});
it('has WebCrypto, Blob and File', async () => {
  expect(typeof crypto.subtle.digest).toBe('function');
  expect(await new Blob(['x']).text()).toBe('x');
  expect(new Uint8Array(await new File([new Uint8Array([1])], 'a').arrayBuffer())).toEqual(new Uint8Array([1]));
});
```

- [ ] **Step 3: Write the architecture test** (`tests/unit/architecture.test.ts`). Rules, as data in `scripts/architecture.ts`: `core` imports only `core`; `reader` imports `core`, `reader`; `storage` imports `core`, `storage`; `rooms/<x>` imports `core`, `reader`, `storage`, `rooms/<x>`; no file outside `src/ui/` imports `svelte`. Only relative imports are checked against layers; package imports are allowed except `svelte`.

```ts
it('flags a core file importing storage', () => {
  expect(findViolations({ 'src/core/a.ts': "import { x } from '../storage/db';" })).toHaveLength(1);
});
it('flags one room importing another', () => {
  expect(findViolations({ 'src/rooms/lectorium/index.ts': "import { convert } from '../scriptorium/index';" })).toHaveLength(1);
});
it('allows a room to use core, reader and storage', () => {
  expect(findViolations({ 'src/rooms/lectorium/index.ts': "import '../../core/errors'; import '../../reader/location'; import '../../storage/db';" })).toEqual([]);
});
it('the source tree respects the layers', () => {
  expect(findViolations(readSourceTree('src'))).toEqual([]);
});
```

- [ ] **Step 4: Run, expect failure** — `npx vitest run` → FAIL, `findViolations` not found.
- [ ] **Step 5: Implement `findViolations` and `readSourceTree(dir: string): Record<string, string>`** in `scripts/architecture.ts`. Regex over `import ... from '...'`, `import '...'` and `import('...')`.
- [ ] **Step 6: Run, expect pass** — `npx vitest run` → all PASS. If any environment test fails under jsdom, stop and report: the choice of test DOM is a spec decision.
- [ ] **Step 7: Placeholder page and tooling files.** `index.html` carries the spec's CSP meta verbatim (`default-src 'self'; img-src 'self' blob: data:; font-src 'self' blob: data:; style-src 'self' blob: 'unsafe-inline'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'`) and loads `src/main.ts`, which writes "Copista" into the page. `scripts/check-licenses.ts` walks `npm ls --omit=dev --all --json`, reads each package's `license`, exits 1 listing any outside the allowlist. `.claude/commit-checks`: `npm run lint`, `npm run typecheck`, `npm test`, one per line. `.github/workflows/ci.yml`: job `check` on ubuntu-latest, Node 22, `npm ci`, lint, typecheck, test, licenses. `LICENSE`: MIT, `Copyright (c) 2026 Giuseppe Spicchiarello`. `CLEANROOM.md`: the rules from Global Constraints and an empty "Sources" list. `DEVLOG.md`: first dated entry (2026-10-08: design, name search, engine-first plan).
- [ ] **Step 8: Update the spec.** Section 5 Units: add `src/rooms/` row. Section 7 Tests row: `jsdom` replaces `happy-dom` (reason: strict XML parsing with `parsererror`, needed for OPF/NCX). Section 9: add `src/rooms/{bibliotheca,lectorium,scriptorium,archivum}/`.
- [ ] **Step 9: Verify** — `npm run lint && npm run typecheck && npm test && npm run licenses` → all exit 0.
- [ ] **Step 10: Commit** — `git add -A && git commit -m "Set up TypeScript, Vitest, lint and CI"`

---

### Task 2: Book model, errors, paths, references, hash

**Files:**
- Create: `src/core/model/book.ts`, `src/core/model/position.ts`, `src/core/errors.ts`, `src/core/paths.ts`, `src/core/refs.ts`, `src/core/hash.ts`
- Test: `tests/unit/core/paths.test.ts`, `tests/unit/core/refs.test.ts`, `tests/unit/core/errors.test.ts`, `tests/unit/core/hash.test.ts`

**Interfaces:**
- Produces (used by every later task):

```ts
// book.ts
export type BookWarning = 'fixed-layout' | 'obfuscated-fonts-ignored' | 'toc-generated' | 'html-fallback' | 'missing-resource';
export interface BookMeta { title: string; authors: string[]; language: string; identifier: string; layout: 'reflowable' | 'pre-paginated' }
export interface Chapter { id: string; href: string; title?: string; html: string; stylesheets: string[]; inlineCss: string }
export interface TocEntry { label: string; chapter: number; fragment?: string; children: TocEntry[] }
export interface Resource { href: string; mediaType: string; data: Uint8Array }
export interface Book { meta: BookMeta; chapters: Chapter[]; toc: TocEntry[]; resources: Map<string, Resource>; cover?: string; warnings: BookWarning[] }
// position.ts
export interface Position { spineIndex: number; fraction: number }
// errors.ts
export type DrmScheme = 'adobe-adept' | 'apple-fairplay' | 'unknown-encryption';
export class CopistaError extends Error {}            // name = class name
export class NotAnEpubError extends CopistaError {}
export class DrmProtectedError extends CopistaError { readonly scheme: DrmScheme }
export class MalformedBookError extends CopistaError {}
export class UnsupportedFormatError extends CopistaError { readonly format: string }
// paths.ts
export function resolveHref(baseFile: string, href: string): { path: string; fragment?: string } | null;
export function relativeHref(fromFile: string, toPath: string): string;
// refs.ts
export function mapHtmlRefs(html: string, map: (ref: string) => string | null): string;
export function mapCssUrls(css: string, map: (url: string) => string | null): string;
// hash.ts
export function sha256Hex(data: Uint8Array): Promise<string>;
```

`Chapter.html` is the body's inner HTML, serialized as HTML. `stylesheets` holds book keys of linked CSS; `inlineCss` holds the chapter's `<style>` text. `mapHtmlRefs` visits `src`, `href`, `xlink:href`, `poster` and each URL in `srcset`; a `null` result removes the attribute (for `srcset`, the candidate). `mapCssUrls` visits `url(...)` in all quote styles and `@import "..."`, always writes `url("...")`, and turns `null` into `url("about:invalid")`.

- [ ] **Step 1: Write the failing tests.**

```ts
// paths.test.ts
expect(resolveHref('OEBPS/text/ch1.xhtml', '../images/a%20b.png')).toEqual({ path: 'OEBPS/images/a b.png' });
expect(resolveHref('OEBPS/text/ch1.xhtml', 'ch2.xhtml#sec-2')).toEqual({ path: 'OEBPS/text/ch2.xhtml', fragment: 'sec-2' });
expect(resolveHref('OEBPS/text/ch1.xhtml', '#note')).toEqual({ path: 'OEBPS/text/ch1.xhtml', fragment: 'note' });
expect(resolveHref('content.opf', 'Caf%C3%A9/%C3%A0.xhtml')).toEqual({ path: 'Café/à.xhtml' });
expect(resolveHref('a/b.xhtml', '50%25.xhtml')).toEqual({ path: 'a/50%.xhtml' });
expect(resolveHref('a/b.xhtml', 'bad%zz.png')).toEqual({ path: 'a/bad%zz.png' });
expect(resolveHref('a/b.xhtml', 'img.png?v=2')).toEqual({ path: 'a/img.png' });
expect(resolveHref('a/b.xhtml', '../../../x.png')).toEqual({ path: 'x.png' });
expect(resolveHref('a/b.xhtml', '/root.png')).toEqual({ path: 'root.png' });
for (const ext of ['https://example.org/x', 'mailto:a@b.c', 'data:image/png;base64,AAAA', 'javascript:alert(1)'])
  expect(resolveHref('a.xhtml', ext)).toBeNull();
expect(relativeHref('EPUB/text/c001.xhtml', 'EPUB/res/a b.png')).toBe('../res/a%20b.png');
expect(relativeHref('EPUB/text/c001.xhtml', 'EPUB/text/c002.xhtml')).toBe('c002.xhtml');
expect(relativeHref('EPUB/content.opf', 'EPUB/text/c001.xhtml')).toBe('text/c001.xhtml');

// refs.test.ts
const k = (r: string) => (r.includes(':') ? r : 'K/' + r);
expect(mapHtmlRefs('<p><img src="a.png"><a href="b.xhtml#x">b</a><a href="https://e.org">e</a></p>', k))
  .toBe('<p><img src="K/a.png"><a href="K/b.xhtml#x">b</a><a href="https://e.org">e</a></p>');
expect(mapHtmlRefs('<img src="x.png" alt="x">', () => null)).toBe('<img alt="x">');
expect(mapHtmlRefs('<img srcset="a.png 1x, b.png 2x">', k)).toBe('<img srcset="K/a.png 1x, K/b.png 2x">');
expect(mapHtmlRefs('<svg><image xlink:href="c.jpg"></image></svg>', k)).toContain('xlink:href="K/c.jpg"');
expect(mapCssUrls('a{background:url(\'i.png\')} @font-face{src:url(f.otf) format("opentype")}', k))
  .toBe('a{background:url("K/i.png")} @font-face{src:url("K/f.otf") format("opentype")}');
expect(mapCssUrls('@import "s.css";', k)).toBe('@import url("K/s.css");');
expect(mapCssUrls('a{background:url(http://e.org/x.png)}', () => null)).toBe('a{background:url("about:invalid")}');

// errors.test.ts
const e = new DrmProtectedError('adobe-adept');
expect(e).toBeInstanceOf(CopistaError);
expect(e.name).toBe('DrmProtectedError');
expect(e.scheme).toBe('adobe-adept');
expect(new UnsupportedFormatError('doc').format).toBe('doc');

// hash.test.ts
expect(await sha256Hex(new TextEncoder().encode('abc')))
  .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
```

- [ ] **Step 2: Run, expect failure** — `npx vitest run tests/unit/core` → FAIL, modules not found.
- [ ] **Step 3: Implement the signatures above.** `resolveHref` treats anything matching `/^[a-z][a-z0-9+.-]*:/i` as external, drops the query, decodes with `decodeURIComponent` per segment (keeping a segment literal when decoding throws), resolves `.`/`..` and clamps at the root. `relativeHref` percent-encodes each segment with `encodeURIComponent`. `mapHtmlRefs` parses through a `<template>` and returns its `innerHTML`.
- [ ] **Step 4: Run, expect pass** — `npx vitest run tests/unit/core` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add book model, errors and path helpers"`

---

### Task 3: Generated fixtures

**Files:**
- Create: `tests/fixtures/png.ts`, `tests/fixtures/zip-builder.ts`, `tests/fixtures/epub-builder.ts`, `tests/fixtures/docx-builder.ts`, `tests/fixtures/catalog.ts`, `tests/fixtures/README.md`, `scripts/make-fixtures.ts`
- Test: `tests/unit/fixtures.test.ts`

**Interfaces:**
- Produces:

```ts
export function makePng(width: number, height: number): Uint8Array;          // png.ts
export const EPUB: Record<EpubFixture, () => Uint8Array>;                    // catalog.ts
export const DOCX: { basic(): Uint8Array; noHeadings(): Uint8Array };
export const OTHER: { notAZip(): Uint8Array; legacyDoc(): Uint8Array; pdf(): Uint8Array };
export function bigEpub(): Uint8Array;
export function textOf(html: string): string;   // template.content.textContent, test helper
```

Fixtures are hand-written XML zipped with fflate **directly**, never through `writeEpub`, so the writer is tested against an independent source. The builders put `mimetype` first and stored, except where a fixture says otherwise. `tests/fixtures/README.md` releases everything generated as CC0.

`EpubFixture` keys and content (later tasks assert these values):

| Key | Content |
|---|---|
| `epub3Nav` | EPUB 3. Title `Fixture Three`; creators `Ada Example`, `Bo Sample`; language `en`; identifier `urn:uuid:00000000-0000-4000-8000-000000000003`. Chapters `OEBPS/text/ch1.xhtml`..`ch3.xhtml`, each `<h1>Chapter One/Two/Three</h1>` plus two paragraphs. Ch2 has `<h2 id="s21">Section 2.1</h2>`, `<img src="../images/cover.png" alt="Cover"/>`, `<b>bold</b>`, `<a href="ch3.xhtml#end">next</a>`, `<a href="https://example.org/">ext</a>`; ch3 ends with `<p id="end">The end.</p>`. All chapters link `../css/book.css` (`body{font-family:serif} @font-face{font-family:P;src:url(../fonts/plain.woff)}`). `OEBPS/fonts/plain.woff` (any bytes). Cover `OEBPS/images/cover.png` = `makePng(2, 3)`, `properties="cover-image"`. Nav: Chapter One; Chapter Two > Section 2.1 (`ch2.xhtml#s21`); Chapter Three. Also an NCX labelled `NCX One/Two/Three` (nav must win). |
| `epub2Ncx` | OPF `version="2.0"`, title `Fixture Two`, creator `Ada Example`, 2 chapters, NCX labels `First Chapter`, `Second Chapter`, cover by `<meta name="cover" content="cover-img"/>` on `OEBPS/images/cover.png`. |
| `epub2Entities` | EPUB 2, one chapter with an XHTML 1.1 DOCTYPE and `<p>Caf&eacute;&nbsp;au lait</p>`. |
| `noToc` | EPUB 3 without nav and NCX; ch1 `<h2>Opening</h2>`, ch2 no heading. |
| `oddNames` | Chapters at `OEBPS/Text Files/capítulo 1.xhtml` and `OEBPS/Text Files/50%.xhtml`, manifest hrefs `Text%20Files/cap%C3%ADtulo%201.xhtml` and `Text%20Files/50%25.xhtml`. Ch1 shows `../Images/deep/nested/fig%201.png` (file `OEBPS/Images/deep/nested/fig 1.png`). |
| `noCover`, `noTitle` | One chapter; no cover / no `dc:title`. |
| `fontObfuscation` | `META-INF/encryption.xml` lists `OEBPS/fonts/obf.otf` with `http://www.idpf.org/2008/embedding`. |
| `drmEncryption` | `encryption.xml` lists `OEBPS/text/ch1.xhtml` with `http://www.w3.org/2001/04/xmlenc#aes128-cbc`. |
| `drmAdept`, `drmFairplay` | Valid book plus `META-INF/rights.xml` / `META-INF/sinf.xml`. |
| `malicious` | One chapter: `<p>Safe text survives</p>`, `<script>window.__pwned=1</script>`, `<img src="x.png" onerror="window.__pwned=2">`, `<a href="javascript:alert(1)">j</a>`, `<img src="https://tracker.invalid/p.png" alt="t">`, `<form action="https://e.invalid"><input/></form>`, `<iframe src="https://e.invalid"></iframe>`, `<p style="background:url(https://e.invalid/s.png)">s</p>`; head `<style>@import url(https://e.invalid/x.css); body{background:url(https://e.invalid/bg.png)}</style>`; linked CSS with `@font-face{src:url(https://e.invalid/f.woff)}`. |
| `fixedLayout` | `<meta property="rendition:layout">pre-paginated</meta>`. |
| `brokenXhtml` | One chapter with unclosed `<p>` tags and `&nbsp;`, `&mdash;`, no DOCTYPE. |
| `missingFiles` | Manifest and spine list ch1 and ch2; only ch1 is in the zip; ch1 shows a missing `../images/gone.png`. |
| `emptySpine` | Spine lists only items missing from the zip. |
| `noContainer` | No `META-INF/container.xml`; one `content.opf` at the root. |
| `zipNotEpub` | A zip with only `readme.txt`. |
| `longChapter` | One chapter of 80 paragraphs of about 300 characters, last one `<p id="end">The end.</p>`. |

`DOCX.basic`: `docProps/core.xml` title `Docx Fixture`, creator `Ada Example`; body: Heading1 `Part One`; paragraph with a bold run `bold` and an italic run `italic`; bullet list `first`, `second`; numbered list `one`, `two` (real `word/numbering.xml`); inline image `makePng(4, 2)`; 2x2 table `a b / c d`; Heading1 `Part Two`; paragraph `End.`. `DOCX.noHeadings`: three plain paragraphs, no core title. `OTHER.legacyDoc`: bytes `D0 CF 11 E0 A1 B1 1A E1` then 504 zeros. `OTHER.pdf`: `%PDF-1.7\n`. `OTHER.notAZip`: `hello`. `bigEpub()`: 200 chapters of about 10 KB text each and one 20 MB stored image of random bytes behind a PNG signature.

- [ ] **Step 1: Write the failing test** (`tests/unit/fixtures.test.ts`):

```ts
it('builds every fixture', () => {
  for (const build of [...Object.values(EPUB), ...Object.values(DOCX), ...Object.values(OTHER)]) expect(build().length).toBeGreaterThan(0);
});
it('puts mimetype first in a normal EPUB', () => {
  expect(Object.keys(unzipSync(EPUB.epub3Nav()))[0]).toBe('mimetype');
});
it('keeps odd file names verbatim', () => {
  expect(Object.keys(unzipSync(EPUB.oddNames()))).toContain('OEBPS/Text Files/capítulo 1.xhtml');
});
it('makes a PNG with the requested size', () => {
  const png = makePng(4, 2);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(new DataView(png.buffer, png.byteOffset).getUint32(16)).toBe(4);
  expect(new DataView(png.buffer, png.byteOffset).getUint32(20)).toBe(2);
});
```

- [ ] **Step 2: Run, expect failure** — `npx vitest run tests/unit/fixtures.test.ts` → FAIL.
- [ ] **Step 3: Implement the builders and catalog.** `makePng` writes IHDR, one IDAT (fflate `zlibSync`), IEND, with a 20-line CRC-32.
- [ ] **Step 4: Implement `scripts/make-fixtures.ts`**: writes every catalog entry plus `bigEpub` to `tests/fixtures/generated/<kebab-key>.<epub|docx|bin>` (`epub3Nav` → `epub3-nav.epub`).
- [ ] **Step 5: Run, expect pass** — `npx vitest run tests/unit/fixtures.test.ts` → PASS; `npm run fixtures` then `ls tests/fixtures/generated | wc -l` → 25 (19 EPUB, 2 DOCX, 3 other, `bigEpub`).
- [ ] **Step 6: Commit** — `git commit -m "Add generated test fixtures"`

---

### Task 4: Sanitizer

**Files:**
- Create: `src/core/sanitize.ts`
- Test: `tests/unit/core/sanitize.test.ts`

**Interfaces:**
- Consumes: `mapHtmlRefs`, `mapCssUrls` (Task 2).
- Produces: `sanitizeHtml(html: string): string` (input and output are body inner HTML whose internal refs are already book keys); `sanitizeCss(css: string): string`.

Rules: forbid `script`, `style`, `link`, `meta`, `base`, `form`, `input`, `button`, `textarea`, `select`, `iframe`, `frame`, `object`, `embed`; event handlers and `javascript:`/`vbscript:` URLs removed (DOMPurify defaults); keep `epub:type`; any resource attribute (`src`, `srcset`, `poster`, `xlink:href` and `href` on non-`a` elements) with a scheme other than `data:image/...` is removed; `a href` keeps `http:`, `https:`, `mailto:` and book keys; `style` attributes go through `sanitizeCss`. `sanitizeCss` removes `@import` rules pointing outside the book, maps external `url()` to `about:invalid`, and removes `expression(`, `behavior:` and `-moz-binding`.

- [ ] **Step 1: Write the failing test.**

```ts
const dirty = '<p>Safe text survives</p><script>window.__pwned=1</script><img src="OEBPS/x.png" onerror="window.__pwned=2">'
  + '<a href="javascript:alert(1)">j</a><img src="https://tracker.invalid/p.png" alt="t"><form action="https://e.invalid"><input></form>'
  + '<iframe src="https://e.invalid"></iframe><object data="x"></object><style>p{}</style>'
  + '<p style="color:red;background:url(https://e.invalid/s.png)">s</p><a href="https://example.org/">ext</a>'
  + '<img src="data:image/png;base64,iVBORw0KGgo="><aside epub:type="footnote" id="n1">note</aside>'
  + '<svg><use xlink:href="https://e.invalid/a.svg#x"></use></svg>';
const clean = sanitizeHtml(dirty);
expect(clean).toContain('<p>Safe text survives</p>');
for (const bad of ['<script', 'onerror', 'javascript:', 'tracker.invalid', '<form', '<input', '<iframe', '<object', '<style', 'e.invalid'])
  expect(clean).not.toContain(bad);
expect(clean).toContain('<img src="OEBPS/x.png">');
expect(clean).toContain('<img alt="t">');
expect(clean).toContain('href="https://example.org/"');
expect(clean).toContain('color:red');
expect(clean).toContain('src="data:image/png;base64,');
expect(clean).toContain('epub:type="footnote"');

const css = sanitizeCss('@import url(https://e.invalid/x.css); @import url("OEBPS/css/b.css"); p{color:red} a{width:expression(alert(1));-moz-binding:url(x)}');
expect(css).not.toContain('e.invalid');
expect(css).toContain('@import url("OEBPS/css/b.css")');
expect(css).toContain('p{color:red}');
for (const bad of ['expression(', '-moz-binding']) expect(css).not.toContain(bad);
```

- [ ] **Step 2: Run, expect failure** — `npx vitest run tests/unit/core/sanitize.test.ts` → FAIL.
- [ ] **Step 3: Implement** with DOMPurify (`FORBID_TAGS`, `ADD_ATTR: ['epub:type']`, an `uponSanitizeAttribute` hook for resource attributes and `style`).
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "Add HTML and CSS sanitizer"`

---

### Task 5: Zip access and DRM detection

**Files:**
- Create: `src/core/epub/zip.ts`, `src/core/epub/drm.ts`
- Test: `tests/unit/core/epub/drm.test.ts`

**Interfaces:**
- Produces:

```ts
export type Zip = Map<string, Uint8Array>;
export function openZip(data: Uint8Array): Zip;                  // throws NotAnEpubError if not a zip
export function readText(zip: Zip, path: string): string | undefined;   // UTF-8, BOM stripped
export type DrmVerdict = { protected: false; obfuscatedFonts: string[] } | { protected: true; scheme: DrmScheme };
export function detectDrm(zip: Zip): DrmVerdict;
```

Rules exactly as spec 6.4: `rights.xml` → `adobe-adept`; `sinf.xml` → `apple-fairplay`; any `EncryptedData` whose `EncryptionMethod/@Algorithm` is not `http://www.idpf.org/2008/embedding` or `http://ns.adobe.com/pdf/enc#RC` → `unknown-encryption`. `CipherReference/@URI` is zip-root relative and percent-encoded.

- [ ] **Step 1: Write the failing test.**

```ts
expect(detectDrm(openZip(EPUB.drmAdept()))).toEqual({ protected: true, scheme: 'adobe-adept' });
expect(detectDrm(openZip(EPUB.drmFairplay()))).toEqual({ protected: true, scheme: 'apple-fairplay' });
expect(detectDrm(openZip(EPUB.drmEncryption()))).toEqual({ protected: true, scheme: 'unknown-encryption' });
expect(detectDrm(openZip(EPUB.fontObfuscation()))).toEqual({ protected: false, obfuscatedFonts: ['OEBPS/fonts/obf.otf'] });
expect(detectDrm(openZip(EPUB.epub3Nav()))).toEqual({ protected: false, obfuscatedFonts: [] });
expect(() => openZip(OTHER.notAZip())).toThrow(NotAnEpubError);
```

- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement** with fflate `unzipSync`; wrap its errors in `NotAnEpubError`; parse `encryption.xml` with `DOMParser` (`application/xml`).
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "Detect DRM-protected EPUBs"`

---

### Task 6: EPUB reader: package, chapters, cover

**Files:**
- Create: `src/core/epub/xml.ts`, `src/core/epub/package.ts`, `src/core/epub/read.ts`
- Test: `tests/unit/core/epub/read.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5.
- Produces:

```ts
export function parseXml(text: string): Document | null;                         // null on parsererror
export function parseXhtml(text: string): { doc: Document; fallback: boolean };  // HTML parser when XML fails
export function readEpub(data: Uint8Array, opts?: { fileName?: string }): Promise<Book>;
```

Behavior to implement (in this order): `openZip` → `detectDrm` (throw `DrmProtectedError`) → container `rootfile` (lenient: if `container.xml` is missing and exactly one `.opf` exists, use it; otherwise `NotAnEpubError`) → OPF: `dc:title` (fallback: `fileName` without extension, then `Untitled`), all `dc:creator` in order, `dc:language` (fallback `und`), the identifier named by `unique-identifier` (fallback `urn:uuid:` + `crypto.randomUUID()`), `rendition:layout` → `layout` → manifest (hrefs resolved to book keys) → spine: items with media type `application/xhtml+xml` or `text/html` become chapters; a spine item missing from the zip is skipped with warning `missing-resource`; zero chapters → `MalformedBookError`. Per chapter: `parseXhtml`; `fallback` adds `html-fallback`; head `<link rel="stylesheet">` → `stylesheets` (only keys present in resources); head `<style>` → `inlineCss` (refs mapped to keys, then `sanitizeCss`); body: refs mapped to keys with `resolveHref`, then `sanitizeHtml`. `Chapter.id` = manifest id. Resources: every non-chapter manifest item present in the zip, except obfuscated fonts (warning `obfuscated-fonts-ignored`); CSS resources get their `url()`s rewritten to keys and pass through `sanitizeCss`. Cover: item with `properties~="cover-image"`, else EPUB 2 `<meta name="cover">` id, else the first image item whose id or href contains `cover` (case-insensitive). `pre-paginated` adds `fixed-layout`. Warnings are de-duplicated. `toc` stays `[]` and `title` unset until Task 7.

- [ ] **Step 1: Write the failing tests.**

```ts
const book = await readEpub(EPUB.epub3Nav());
expect(book.meta).toEqual({ title: 'Fixture Three', authors: ['Ada Example', 'Bo Sample'], language: 'en',
  identifier: 'urn:uuid:00000000-0000-4000-8000-000000000003', layout: 'reflowable' });
expect(book.chapters.map((c) => c.href)).toEqual(['OEBPS/text/ch1.xhtml', 'OEBPS/text/ch2.xhtml', 'OEBPS/text/ch3.xhtml']);
expect(book.chapters[1]!.html).toContain('src="OEBPS/images/cover.png"');
expect(book.chapters[1]!.html).toContain('href="OEBPS/text/ch3.xhtml#end"');
expect(book.chapters[0]!.stylesheets).toEqual(['OEBPS/css/book.css']);
expect(new TextDecoder().decode(book.resources.get('OEBPS/css/book.css')!.data)).toContain('url("OEBPS/fonts/plain.woff")');
expect(book.cover).toBe('OEBPS/images/cover.png');
expect(book.warnings).toEqual([]);

expect((await readEpub(EPUB.epub2Ncx())).cover).toBe('OEBPS/images/cover.png');
const odd = await readEpub(EPUB.oddNames());
expect(odd.chapters.map((c) => c.href)).toEqual(['OEBPS/Text Files/capítulo 1.xhtml', 'OEBPS/Text Files/50%.xhtml']);
expect(odd.chapters[0]!.html).toContain('src="OEBPS/Images/deep/nested/fig 1.png"');
expect(odd.resources.has('OEBPS/Images/deep/nested/fig 1.png')).toBe(true);
expect((await readEpub(EPUB.noCover())).cover).toBeUndefined();
expect((await readEpub(EPUB.noTitle(), { fileName: 'My Book.epub' })).meta.title).toBe('My Book');

const fonts = await readEpub(EPUB.fontObfuscation());
expect(fonts.resources.has('OEBPS/fonts/obf.otf')).toBe(false);
expect(fonts.warnings).toContain('obfuscated-fonts-ignored');
await expect(readEpub(EPUB.drmAdept())).rejects.toMatchObject({ name: 'DrmProtectedError', scheme: 'adobe-adept' });
await expect(readEpub(OTHER.notAZip())).rejects.toBeInstanceOf(NotAnEpubError);
await expect(readEpub(EPUB.zipNotEpub())).rejects.toBeInstanceOf(NotAnEpubError);
await expect(readEpub(EPUB.emptySpine())).rejects.toBeInstanceOf(MalformedBookError);

expect((await readEpub(EPUB.noContainer())).chapters).toHaveLength(1);
const broken = await readEpub(EPUB.brokenXhtml());
expect(broken.warnings).toContain('html-fallback');
expect(textOf(broken.chapters[0]!.html)).toContain(' ');
expect(textOf(broken.chapters[0]!.html)).toContain('—');
expect(textOf((await readEpub(EPUB.epub2Entities())).chapters[0]!.html)).toContain('Café au lait');   // Review Focus 3
const fixed = await readEpub(EPUB.fixedLayout());
expect(fixed.meta.layout).toBe('pre-paginated');
expect(fixed.warnings).toContain('fixed-layout');
const missing = await readEpub(EPUB.missingFiles());                                   // Review Focus 4
expect(missing.chapters).toHaveLength(1);
expect(missing.warnings).toContain('missing-resource');

const mal = await readEpub(EPUB.malicious());
const all = mal.chapters[0]!.html + mal.chapters[0]!.inlineCss
  + [...mal.resources.values()].filter((r) => r.mediaType === 'text/css').map((r) => new TextDecoder().decode(r.data)).join('');
for (const bad of ['<script', 'onerror', 'javascript:', 'e.invalid', 'tracker.invalid']) expect(all).not.toContain(bad);
expect(mal.chapters[0]!.html).toContain('Safe text survives');

it('opens a 200-chapter book with a 20 MB image within 20 s', async () => {               // Review Focus 1
  const big = await readEpub(bigEpub());
  expect(big.chapters).toHaveLength(200);
}, 20_000);
```

- [ ] **Step 2: Run, expect failure** — `npx vitest run tests/unit/core/epub/read.test.ts` → FAIL.
- [ ] **Step 3: Implement `parseXml`, `parseXhtml`, `parsePackage(opfXml: string, opfPath: string)`, `readEpub`** per the behavior above.
- [ ] **Step 4: Run, expect pass.** If the big-book test exceeds 20 s, profile before touching the limit; report the measured time.
- [ ] **Step 5: Commit** — `git commit -m "Read EPUB packages, chapters and covers"`

---

### Task 7: Tables of contents

**Files:**
- Create: `src/core/epub/toc.ts`
- Modify: `src/core/epub/read.ts` (fill `toc` and `Chapter.title`)
- Test: `tests/unit/core/epub/toc.test.ts`

**Interfaces:**
- Produces:

```ts
export function parseNav(xhtml: string, navPath: string, chapterIndex: Map<string, number>): TocEntry[];
export function parseNcx(xml: string, ncxPath: string, chapterIndex: Map<string, number>): TocEntry[];
export function tocFromHeadings(chapters: Chapter[]): TocEntry[];
```

`chapterIndex` maps chapter keys to spine index. Order of preference: EPUB 3 nav (`nav` with `epub:type` containing `toc`), then NCX (spine `toc` attribute, else the manifest item with media type `application/x-dtbncx+xml`), then headings (warning `toc-generated`). An empty nav or NCX counts as missing. Labels: text content with whitespace collapsed and trimmed. Entries whose target is not a chapter are dropped and their children lifted to the parent's level. `tocFromHeadings`: one entry per chapter, label = first `h1`–`h3` text, else `Section N` (1-based). `Chapter.title` = label of the first TOC entry, at any depth, that points at that chapter with no fragment; else its first heading; else unset.

- [ ] **Step 1: Write the failing tests.**

```ts
const b = await readEpub(EPUB.epub3Nav());
expect(b.toc).toEqual([
  { label: 'Chapter One', chapter: 0, children: [] },
  { label: 'Chapter Two', chapter: 1, children: [{ label: 'Section 2.1', chapter: 1, fragment: 's21', children: [] }] },
  { label: 'Chapter Three', chapter: 2, children: [] },
]);
expect(b.chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two', 'Chapter Three']);
expect((await readEpub(EPUB.epub2Ncx())).toc.map((e) => e.label)).toEqual(['First Chapter', 'Second Chapter']);
const nt = await readEpub(EPUB.noToc());
expect(nt.toc.map((e) => e.label)).toEqual(['Opening', 'Section 2']);
expect(nt.warnings).toContain('toc-generated');

const idx = new Map([['a/c1.xhtml', 0]]);
expect(parseNav('<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>'
  + '<li><a href="c1.xhtml">  Chapter\n One </a></li>'
  + '<li><span>Part</span><ol><li><a href="https://e.org">x</a><ol><li><a href="c1.xhtml#p">Deep</a></li></ol></li></ol></li>'
  + '</ol></nav></body></html>', 'a/nav.xhtml', idx))
  .toEqual([{ label: 'Chapter One', chapter: 0, children: [] }, { label: 'Deep', chapter: 0, fragment: 'p', children: [] }]);
```

The second assertion pins two rules: a `span` heading with no link and an external link are both non-targets, so their descendants are lifted.

- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement `toc.ts` and wire it into `readEpub`.**
- [ ] **Step 4: Run, expect pass** — `npx vitest run tests/unit/core/epub` → PASS (Task 6 tests still pass).
- [ ] **Step 5: Commit** — `git commit -m "Read tables of contents"`

---

### Task 8: Same results in real browsers

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/harness/engine.html`, `tests/harness/engine.ts`, `tests/fixtures/expectations.ts`, `tests/e2e/engine.spec.ts`, `tests/unit/expectations.test.ts`
- Modify: `vite.config.ts` (dev server only, port 5175), `.github/workflows/ci.yml` (job `e2e`: `npx playwright install --with-deps chromium webkit`, `npm run test:e2e`)

**Interfaces:**
- Consumes: `readEpub`, the fixture catalog.
- Produces: `window.engine` in `tests/harness/engine.ts`, an object later tasks extend (`readEpub` now; `writeEpub`, `convert` added in Tasks 10 and 21); `READ_EXPECTATIONS: Record<EpubFixture, ReadExpectation>` where `ReadExpectation = { error: string } | { title: string; chapters: number; tocLabels: string[]; warnings: BookWarning[] }`.

`READ_EXPECTATIONS` restates Tasks 6 and 7: `epub3Nav` → `Fixture Three`, 3, `['Chapter One','Chapter Two','Chapter Three']`, `[]`; `noToc` → 2 chapters, `['Opening','Section 2']`, `['toc-generated']`; `drm*` → `DrmProtectedError`; `zipNotEpub` → `NotAnEpubError`; `emptySpine` → `MalformedBookError`; and so on for every key. The same table drives a jsdom test and a browser test, so a parser difference between jsdom and a real browser fails one of them.

`playwright.config.ts`: projects `chromium` and `webkit`; `webServer: { command: 'npx vite --port 5175 --strictPort', port: 5175 }`; `globalSetup` runs `npm run fixtures`. The harness page carries the spec CSP meta and fetches fixtures from `/tests/fixtures/generated/`.

- [ ] **Step 1: Write `tests/unit/expectations.test.ts`**: for each key, `readEpub(EPUB[key]())` matches its expectation (`error` → rejection with that `name`; otherwise `title`, `chapters.length`, top-level TOC labels, `warnings`).
- [ ] **Step 2: Write `tests/e2e/engine.spec.ts`**: the same loop, run inside the page with `page.evaluate` against `window.engine.readEpub`, plus `bigEpub` opening in under 5 s (Review Focus 1).
- [ ] **Step 3: Run, expect failure** — `npm run test:e2e` → FAIL, harness missing.
- [ ] **Step 4: Implement the harness, config and expectations.**
- [ ] **Step 5: Run, expect pass** — `npm test && npm run test:e2e` → PASS in jsdom, Chromium and WebKit. A browser-only failure is a real bug in `core/`: fix it there, not in the expectation.
- [ ] **Step 6: Commit** — `git commit -m "Check the reader in Chromium and WebKit"`

---

### Task 9: Real-world corpus

**Files:**
- Create: `tests/corpus.json`, `scripts/fetch-corpus.ts`, `vitest.corpus.config.ts`, `tests/corpus/corpus.test.ts`
- Modify: `.github/workflows/ci.yml` (job `corpus`, cache `tests/fixtures/corpus` keyed on `hashFiles('tests/corpus.json')`), `CLEANROOM.md` (corpus sources and licenses)

**Interfaces:**
- Consumes: `readEpub`.
- Produces: `tests/corpus.json` entries `{ id: string; source: 'standardebooks' | 'gutenberg'; url: string; sha256: string; license: string }`; corpus files at `tests/fixtures/corpus/<id>.epub` (used again by Task 10).

Selection: 20 Standard Ebooks titles covering a long novel, poetry, a play, a book with many endnotes, an illustrated book, a short-story collection, a translated work; 5 Project Gutenberg EPUBs, at least one EPUB 2 and one non-English. Use each site's normal per-book download URL; for Gutenberg prefer an official mirror from `gutenberg.org/MIRRORS.ALL` that serves the same files. Record the license of each source (Standard Ebooks: CC0 for their work; Gutenberg: public domain in the US, Project Gutenberg license). Present the list to the owner before committing it.

`fetch-corpus.ts`: downloads only missing files, 2 s between requests, a `User-Agent` naming the project, checks the `PK` signature and SHA-256, exits 1 on any mismatch. `--update` prints fresh hashes for a new entry instead of failing.

- [ ] **Step 1: Write `tests/corpus/corpus.test.ts`.** A missing file throws (the npm script fetches first); nothing is skipped.

```ts
for (const entry of corpus) it(entry.id, async () => {
  const data = new Uint8Array(readFileSync(`tests/fixtures/corpus/${entry.id}.epub`));
  const book = await readEpub(data);
  expect(book.meta.title.trim()).not.toBe('');
  expect(book.meta.authors.length).toBeGreaterThan(0);
  expect(book.toc.length).toBeGreaterThan(0);
  expect(book.chapters.length).toBe(countXhtmlItemrefs(data));   // independent count from the OPF with regexes
  expect(book.warnings).not.toContain('missing-resource');
  expect(book.chapters.every((c) => c.html.trim() !== '')).toBe(true);
}, 30_000);
```

- [ ] **Step 2: Build `tests/corpus.json`** with `npx tsx scripts/fetch-corpus.ts --update`, after the owner approves the list.
- [ ] **Step 3: Run** — `npm run test:corpus`. Every failure is a reader bug or a spec gap: fix the reader with a new generated fixture that reproduces the quirk (Task 3 catalog plus a test in Task 6/7 style), never by editing the corpus test.
- [ ] **Step 4: Run, expect pass** — `npm run test:corpus` → 25 PASS; `npm test` still PASS.
- [ ] **Step 5: Commit** — `git commit -m "Test the reader against a real-world corpus"`

---

### Task 10: EPUB writer and EPUBCheck

**Files:**
- Create: `src/core/epub/xhtml.ts`, `src/core/epub/write.ts`, `scripts/write-outputs.ts`, `scripts/epubcheck.ts`
- Modify: `tests/harness/engine.ts` (add `writeEpub`), `.github/workflows/ci.yml` (job `epubcheck`: `actions/setup-java` Temurin 21, cache `.cache/epubcheck`, fetch corpus, `npm run epubcheck -- --corpus`)
- Test: `tests/unit/core/epub/write.test.ts`

**Interfaces:**
- Consumes: `Book`, `relativeHref`, `mapHtmlRefs`, `mapCssUrls`, `readEpub` (tests only).
- Produces: `htmlToXhtml(html: string): string`; `writeEpub(book: Book, opts?: { modified?: Date }): Uint8Array`; `write-outputs.ts` exports `OUTPUTS: Array<{ name: string; make(): Promise<Uint8Array> }>` that Tasks 11 and 13 extend.

Layout written: `mimetype` (first, stored, no extra field), `META-INF/container.xml`, `EPUB/content.opf`, `EPUB/nav.xhtml`, chapters `EPUB/text/c001.xhtml`…, resources `EPUB/res/<name>` where `<name>` is the original basename with every character outside `[A-Za-z0-9._-]` replaced by `-`, de-duplicated with `-2`, `-3`. Manifest ids `c001`…, `r001`…, `nav`. OPF: EPUB 3.3, `unique-identifier="uid"`, `dc:identifier id="uid"`, `dc:title`, one `dc:creator` per author, `dc:language`, `<meta property="dcterms:modified">` in `YYYY-MM-DDThh:mm:ssZ`, `properties="nav"`, `properties="cover-image"` on the cover, `rendition:layout` when `pre-paginated`. Chapters: XHTML with `xmlns` and `xmlns:epub`, `<title>` = chapter title or book title, `<link>` per stylesheet, `<style>` for `inlineCss`; all book keys rewritten with `relativeHref`, keys with no matching chapter or resource removed. Nav: `<nav epub:type="toc" id="toc">` from `book.toc`, nested `ol`. Zip entries use `modified` (default `new Date()`) as mtime, so output is deterministic.

`epubcheck.ts`: downloads the latest EPUBCheck 5.x release zip from `github.com/w3c/epubcheck/releases`, pins version and SHA-256 as constants at the top of the file, unzips to `.cache/epubcheck/`; exits 1 with "Java 11+ is required" when `java` is missing; runs `java -jar epubcheck.jar <file> --json <out>` on every `.epub` in `tests/fixtures/output/`; prints `name: N errors, M warnings`; exits 1 on any `ERROR` or `FATAL`. `write-outputs.ts` writes each readable EPUB fixture rewritten by `writeEpub`; with `--corpus`, also each corpus book.

- [ ] **Step 1: Write the failing tests.**

```ts
const original = await readEpub(EPUB.epub3Nav());
const modified = new Date('2026-10-08T12:00:00Z');
const bytes = writeEpub(original, { modified });
const ascii = (a: Uint8Array) => String.fromCharCode(...a);
expect(ascii(bytes.subarray(30, 38))).toBe('mimetype');
expect(ascii(bytes.subarray(38, 58))).toBe('application/epub+zip');
expect(bytes[8]! | (bytes[9]! << 8)).toBe(0);    // stored
expect(bytes[28]! | (bytes[29]! << 8)).toBe(0);  // no extra field

const zip = unzipSync(bytes);
expect(Object.keys(zip).every((k) => /^[A-Za-z0-9._/-]+$/.test(k))).toBe(true);
const opf = strFromU8(zip['EPUB/content.opf']!);
expect(opf).toContain('<meta property="dcterms:modified">2026-10-08T12:00:00Z</meta>');
expect(opf).toContain('properties="nav"');
expect(opf).toContain('properties="cover-image"');
expect(writeEpub(original, { modified })).toEqual(bytes);

const again = await readEpub(bytes);
expect(again.meta).toEqual(original.meta);
expect(again.toc).toEqual(original.toc);
expect(again.chapters.map((c) => textOf(c.html))).toEqual(original.chapters.map((c) => textOf(c.html)));
expect(again.resources.get(again.cover!)!.data).toEqual(original.resources.get(original.cover!)!.data);
expect(again.chapters[1]!.html).toContain(`href="${again.chapters[2]!.href}#end"`);
expect(again.warnings).toEqual([]);

for (const [name, build] of Object.entries(EPUB)) {
  if ('error' in READ_EXPECTATIONS[name as EpubFixture]) continue;
  const out = unzipSync(writeEpub(await readEpub(build())));
  for (const [path, data] of Object.entries(out))
    if (path.endsWith('.xhtml') || path.endsWith('.opf')) expect(parseXml(strFromU8(data)), `${name} ${path}`).not.toBeNull();
}
```

- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement `htmlToXhtml`** (parse as HTML, serialize the body's children with `XMLSerializer`) **and `writeEpub`.**
- [ ] **Step 4: Run, expect pass** — `npx vitest run tests/unit/core/epub` → PASS.
- [ ] **Step 5: Implement `write-outputs.ts` and `epubcheck.ts`; add `writeEpub` to the browser harness with a round-trip check on `epub3Nav` in `engine.spec.ts`.**
- [ ] **Step 6: Run EPUBCheck** — `npm run epubcheck`. Expected: every file `0 errors`. Java 21 (Temurin) is installed locally, so this step must run and pass here, not only in CI. Fix every EPUBCheck error in the writer, never by excluding a file.
- [ ] **Step 7: Commit** — `git commit -m "Write EPUB 3 and validate it with EPUBCheck"`

---

### Task 11: Text and Markdown to Book

**Files:**
- Create: `src/core/convert/detect.ts`, `src/core/convert/decode.ts`, `src/core/convert/build.ts`, `src/core/convert/from-txt.ts`, `src/core/convert/from-md.ts`
- Modify: `scripts/write-outputs.ts` (add `from-txt.epub`, `from-md.epub`)
- Test: `tests/unit/core/convert/detect.test.ts`, `decode.test.ts`, `from-txt.test.ts`, `from-md.test.ts`

**Interfaces:**
- Produces:

```ts
export type InputFormat = 'epub' | 'docx' | 'md' | 'txt';
export function detectFormat(data: Uint8Array, fileName: string): InputFormat;   // throws UnsupportedFormatError
export function decodeText(data: Uint8Array): string;
export interface NewBookMeta { title: string; author: string; language?: string }
export interface Section { title?: string; html: string }
export function splitByHeading(html: string): Section[];
export function bookFromSections(sections: Section[], meta: NewBookMeta, resources?: Map<string, Resource>): Book;
export function fromTxt(data: Uint8Array, meta: NewBookMeta): Promise<Book>;
export function parseFrontMatter(md: string): { fields: Record<string, string>; body: string };
export function fromMarkdown(data: Uint8Array, meta: Partial<NewBookMeta>): Promise<Book>;
```

`detectFormat`: zip with `mimetype` = `application/epub+zip` or `META-INF/container.xml` → `epub`; zip with `word/document.xml` → `docx`; other zip → `UnsupportedFormatError('zip')`; OLE signature → `'doc'`; `%PDF` → `'pdf'`; extension `.md`/`.markdown` → `md`; otherwise text (a UTF-16 BOM, or no NUL byte in the first 1024 bytes) → `txt`; else `UnsupportedFormatError('unknown')`. `decodeText`: UTF-8 BOM → UTF-8; UTF-16 LE/BE BOM → UTF-16; else UTF-8 with `fatal: true`, falling back to `windows-1252`; CRLF and CR become LF. `bookFromSections`: each section is sanitized; hrefs `text/c001.xhtml`…; ids `c001`…; a section without title gets the book title; TOC one entry per section; language default `en`; identifier `urn:uuid:` + `crypto.randomUUID()`; layout `reflowable`. `splitByHeading`: split at `h1` if the HTML has any, else at `h2`, else one untitled section; content before the first heading becomes its own section when it has text or images; the heading element stays at the top of its section's HTML. `fromTxt`: paragraphs are separated by blank lines, single newlines become `<br>`, text is HTML-escaped; a chapter heading is a line of at most 60 characters, alone between blank lines (or at the start), matching `/^(chapter|part|book|prologue|epilogue|introduction|preface)\b/i` or `/^[IVXLC]+\.?$/`; it becomes `<h1>`. `fromMarkdown`: `parseFrontMatter` reads a leading `---` block of `key: value` lines; `title`/`author`/`language` from it fill whatever `meta` leaves empty; then title falls back to `Untitled`, author to `Unknown`; body through `marked`, then `splitByHeading`. Images whose source is not `data:image/` are removed by the sanitizer (no network).

- [ ] **Step 1: Write the failing tests.**

```ts
const enc = (s: string) => new TextEncoder().encode(s);
// detect
expect(detectFormat(EPUB.epub3Nav(), 'x.bin')).toBe('epub');
expect(detectFormat(DOCX.basic(), 'x.zip')).toBe('docx');
expect(detectFormat(enc('# Hi'), 'notes.markdown')).toBe('md');
expect(detectFormat(enc('plain'), 'notes')).toBe('txt');
expect(() => detectFormat(OTHER.legacyDoc(), 'old.doc')).toThrow(expect.objectContaining({ format: 'doc' }));
expect(() => detectFormat(OTHER.pdf(), 'a.pdf')).toThrow(expect.objectContaining({ format: 'pdf' }));
expect(() => detectFormat(EPUB.zipNotEpub(), 'a.zip')).toThrow(expect.objectContaining({ format: 'zip' }));
// decode (Review Focus 2)
expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x43, 0x61, 0x66, 0xc3, 0xa9]))).toBe('Café');
expect(decodeText(new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x20, 0x93, 0x71, 0x94]))).toBe('Café “q”');
expect(decodeText(new Uint8Array([0xff, 0xfe, 0x43, 0x00, 0xe9, 0x00]))).toBe('Cé');
expect(decodeText(enc('a\r\nb\rc'))).toBe('a\nb\nc');
// txt
const b = await fromTxt(enc('CHAPTER I\n\nIt was a dark night.\nStill dark.\n\nNext <b>.\n\nCHAPTER II\n\nMorning.'), { title: 'Night', author: 'Ada Example' });
expect(b.meta).toMatchObject({ title: 'Night', authors: ['Ada Example'], language: 'en', layout: 'reflowable' });
expect(b.chapters.map((c) => c.title)).toEqual(['CHAPTER I', 'CHAPTER II']);
expect(b.chapters[0]!.html).toBe('<h1>CHAPTER I</h1><p>It was a dark night.<br>Still dark.</p><p>Next &lt;b&gt;.</p>');
expect(b.toc.map((e) => e.label)).toEqual(['CHAPTER I', 'CHAPTER II']);
expect((await fromTxt(enc('Just one paragraph.'), { title: 'T', author: 'A' })).chapters.map((c) => c.title)).toEqual(['T']);
// md
const m = await fromMarkdown(enc('# One\n\nHello *there*.\n\n![pic](https://e.invalid/p.png)\n\n# Two\n\n- a\n- b\n\n<script>x</script>'), { title: 'M', author: 'A' });
expect(m.chapters.map((c) => c.title)).toEqual(['One', 'Two']);
expect(m.chapters[0]!.html).toContain('<em>there</em>');
expect(m.chapters[0]!.html).not.toContain('e.invalid');
expect(m.chapters[1]!.html).toContain('<li>a</li>');
expect(m.chapters[1]!.html).not.toContain('<script');
expect((await fromMarkdown(enc('## A\n\nx\n\n## B\n\ny'), { title: 'M', author: 'A' })).chapters.map((c) => c.title)).toEqual(['A', 'B']);
const fm = await fromMarkdown(enc('---\ntitle: From Front\nauthor: Bo Sample\n---\n# One\n\nx'), {});
expect(fm.meta).toMatchObject({ title: 'From Front', authors: ['Bo Sample'] });
```

- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement the five files.**
- [ ] **Step 4: Run, expect pass**, then add `from-txt.epub` and `from-md.epub` to `OUTPUTS` and run `npm run epubcheck`
- [ ] **Step 5: Commit** — `git commit -m "Convert text and Markdown to EPUB"`

---

### Task 12: Text, Markdown and HTML output

**Files:**
- Create: `src/core/convert/to-text.ts`, `src/core/convert/to-md.ts`, `src/core/convert/to-html.ts`
- Test: `tests/unit/core/convert/to-text.test.ts`, `to-md.test.ts`, `to-html.test.ts`

**Interfaces:**
- Produces: `toText(book: Book): string`; `toMarkdown(book: Book): string`; `toHtml(book: Book, opts?: { print?: boolean }): string`.

`toText`: header `title\nauthors joined by ", "\n\n`, then each chapter: block elements separated by one blank line, `br` → newline, list items prefixed `- `, images → `[Image: alt]` or `[Image]`, chapters separated by two blank lines, output ends with one `\n`. `toMarkdown`: YAML front matter (`title`, `author` = authors joined by `, `, `language`), then chapters through turndown with `headingStyle: 'atx'`, `emDelimiter: '*'`, `strongDelimiter: '**'`, `bulletListMarker: '-'`; images → `[Image: alt]`; internal links → their text only. `toHtml`: one self-contained document: `<html lang>`, escaped `<title>`, `<meta charset="utf-8">`, book CSS inlined in one `<style>` after `sanitizeCss` with `url()`s turned into `data:` URIs, a `<nav>` contents list, one `<section class="chapter" id="ch-N">` per chapter (1-based); element ids inside become `ch-N-<id>`; internal links become `#ch-N` or `#ch-N-<fragment>`; images become `data:` URIs; no `<script>`. `print: true` adds `@page { margin: 2cm }` and `section.chapter { break-before: page }` and `<meta name="color-scheme" content="light">`.

- [ ] **Step 1: Write the failing tests.**

```ts
const book = await readEpub(EPUB.epub3Nav());
const txt = toText(book);
expect(txt.startsWith('Fixture Three\nAda Example, Bo Sample\n\nChapter One\n\n')).toBe(true);
expect(txt).toContain('[Image: Cover]');
expect(txt).not.toMatch(/<[a-z]/i);
expect(txt.endsWith('The end.\n')).toBe(true);

// spec 8: Markdown -> EPUB -> Markdown keeps text and headings
const src = '# One\n\nHello **bold** and *it*.\n\n## Sub\n\n- a\n- b\n\n# Two\n\nEnd.';
const back = toMarkdown(await readEpub(writeEpub(await fromMarkdown(enc(src), { title: 'RT', author: 'Ada Example' }))));
expect(back.startsWith('---\ntitle: RT\nauthor: Ada Example\nlanguage: en\n---\n')).toBe(true);
expect(back.match(/^#{1,2} .+$/gm)).toEqual(['# One', '## Sub', '# Two']);
expect(back).toContain('Hello **bold** and *it*.');
expect(back).toMatch(/^-\s+a$/m);
expect((await fromMarkdown(enc(back), {})).meta.title).toBe('RT');

const doc = new DOMParser().parseFromString(toHtml(book), 'text/html');
expect(doc.title).toBe('Fixture Three');
expect(doc.querySelectorAll('section.chapter')).toHaveLength(3);
expect(doc.querySelector('img')!.getAttribute('src')!.startsWith('data:image/png;base64,')).toBe(true);
expect(doc.querySelector('a[href="#ch-3-end"]')).not.toBeNull();
expect(doc.getElementById('ch-3-end')).not.toBeNull();
expect(doc.querySelector('nav a[href="#ch-1"]')).not.toBeNull();
expect(doc.querySelector('script')).toBeNull();
expect(doc.querySelector('style')!.textContent).toContain('data:');
expect(toHtml({ ...book, meta: { ...book.meta, title: 'A <b> & "c"' } })).toContain('<title>A &lt;b&gt; &amp; "c"</title>');
const print = toHtml(book, { print: true });
expect(print).toContain('@page');
expect(print).toContain('break-before: page');
```

- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement the three files.**
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "Export text, Markdown and HTML"`

---

### Task 13: .docx to Book

**Files:**
- Create: `src/core/convert/from-docx.ts`
- Modify: `scripts/write-outputs.ts` (add `from-docx.epub`)
- Test: `tests/unit/core/convert/from-docx.test.ts`

**Interfaces:**
- Consumes: `bookFromSections`, `splitByHeading` (Task 11), `openZip` (Task 5).
- Produces: `fromDocx(data: Uint8Array, opts?: { fileName?: string }): Promise<Book>`.

mammoth `convertToHtml({ arrayBuffer })` with an image converter that stores each image as resource `images/img-001.<ext>` (extension from content type) and uses that key as `src`. Title and author from `docProps/core.xml` (`dc:title`, `dc:creator`); title fallback: `fileName` without extension, then `Untitled`; author fallback `Unknown`. Language from `dc:language`, else `en`. A zip without `word/document.xml` → `MalformedBookError`. Tables stay tables in the `Book`.

- [ ] **Step 1: Write the failing test.**

```ts
const b = await fromDocx(DOCX.basic());
expect(b.meta).toMatchObject({ title: 'Docx Fixture', authors: ['Ada Example'] });
expect(b.chapters.map((c) => c.title)).toEqual(['Part One', 'Part Two']);
const h = b.chapters[0]!.html;
for (const s of ['<strong>bold</strong>', '<em>italic</em>', '<ul><li>first</li><li>second</li></ul>', '<ol><li>one</li><li>two</li></ol>', '<table'])
  expect(h).toContain(s);
const src = /src="([^"]+)"/.exec(h)![1]!;
expect(b.resources.get(src)).toMatchObject({ mediaType: 'image/png' });
const plain = await fromDocx(DOCX.noHeadings(), { fileName: 'Report.docx' });
expect(plain.meta.title).toBe('Report');
expect(plain.chapters).toHaveLength(1);
await expect(fromDocx(EPUB.zipNotEpub())).rejects.toBeInstanceOf(MalformedBookError);
```

- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement `fromDocx`.**
- [ ] **Step 4: Run, expect pass**; add `from-docx.epub` to `OUTPUTS`; run `npm run epubcheck`.
- [ ] **Step 5: Commit** — `git commit -m "Import .docx files"`

---

### Task 14: Book to .docx

**Files:**
- Create: `src/core/convert/image-size.ts`, `src/core/convert/to-docx.ts`
- Test: `tests/unit/core/convert/image-size.test.ts`, `to-docx.test.ts`

**Interfaces:**
- Produces: `imageSize(data: Uint8Array, mediaType: string): { width: number; height: number } | null`; `toDocx(book: Book): Uint8Array`.

Parts written (ECMA-376 Part 1): `[Content_Types].xml`, `_rels/.rels`, `docProps/core.xml` (title, creator = authors joined by `, `, language), `word/document.xml`, `word/styles.xml` (Normal, Heading1–3, ListParagraph), `word/numbering.xml` (one bullet and one decimal abstract numbering, 3 levels), `word/_rels/document.xml.rels`, `word/media/imageN.<ext>`. Mapping: `h1`–`h3` → Heading1–3, `h4`–`h6` → Heading3; `p`, `div`, `blockquote` → paragraphs; `strong`/`b` → `w:b`; `em`/`i` → `w:i`; `ul`/`ol` → numbered paragraphs, nesting → `w:ilvl`; `br` → `w:br`; `img` → inline `w:drawing`, size from `imageSize` at 96 dpi (9525 EMU per pixel), scaled down to at most 6 inches (5486400 EMU) wide, 300×200 px when the size is unknown; table → one paragraph per row, cell texts joined by ` | `; links → their text. One `<w:br w:type="page"/>` before every chapter except the first.

- [ ] **Step 1: Write the failing tests.**

```ts
expect(imageSize(makePng(4, 2), 'image/png')).toEqual({ width: 4, height: 2 });
expect(imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x40]), 'image/jpeg')).toEqual({ width: 64, height: 32 });
expect(imageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x05, 0x00, 0x07, 0x00]), 'image/gif')).toEqual({ width: 5, height: 7 });
expect(imageSize(new Uint8Array([1, 2, 3]), 'image/png')).toBeNull();

const bytes = toDocx(await fromDocx(DOCX.basic()));
const zip = unzipSync(bytes);
for (const part of ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels', 'word/media/image1.png'])
  expect(zip[part], part).toBeDefined();
for (const [p, d] of Object.entries(zip)) if (/\.(xml|rels)$/.test(p)) expect(parseXml(strFromU8(d)), p).not.toBeNull();

// mammoth is an independent reader of our output
const back = await fromDocx(bytes);
expect(back.meta.title).toBe('Docx Fixture');
expect(back.chapters.map((c) => c.title)).toEqual(['Part One', 'Part Two']);
for (const s of ['<strong>bold</strong>', '<em>italic</em>', '<ul><li>first</li><li>second</li></ul>', '<ol><li>one</li><li>two</li></ol>', 'a | b', 'c | d'])
  expect(back.chapters[0]!.html).toContain(s);
expect(back.resources.size).toBe(1);

const fromEpub = toDocx(await readEpub(EPUB.epub3Nav()));
expect((await fromDocx(fromEpub)).chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two', 'Chapter Three']);
expect(strFromU8(unzipSync(fromEpub)['word/document.xml']!).split('<w:br w:type="page"/>')).toHaveLength(3);
```

- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement `imageSize` and `toDocx`.**
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "Export .docx files"`

---

### Task 15: Reading positions

**Files:**
- Create: `src/reader/location.ts`
- Test: `tests/unit/reader/location.test.ts`

**Interfaces:**
- Produces:

```ts
export function fractionForPage(page: number, pageCount: number): number;   // page / pageCount
export function pageForFraction(fraction: number, pageCount: number): number;
export function bookPercent(pos: Position, chapterLengths: number[]): number;  // integer 0..100, weighted by length
export function clampPosition(pos: Position, chapterCount: number): Position;
export function chapterForHref(book: Book, key: string): { spineIndex: number; fragment?: string } | null;
```

`pageForFraction` = `Math.min(pageCount - 1, Math.floor(fraction * pageCount + 1e-6))`, 0 for `pageCount <= 0`, `NaN`, or negative fractions.

- [ ] **Step 1: Write the failing test.**

```ts
for (let n = 1; n <= 200; n++) for (let p = 0; p < n; p++) expect(pageForFraction(fractionForPage(p, n), n)).toBe(p);
expect(pageForFraction(1, 10)).toBe(9);
expect(pageForFraction(-0.2, 10)).toBe(0);
expect(pageForFraction(Number.NaN, 10)).toBe(0);
expect(pageForFraction(0.5, 0)).toBe(0);
expect(bookPercent({ spineIndex: 1, fraction: 0.5 }, [100, 100, 200])).toBe(38);
expect(bookPercent({ spineIndex: 2, fraction: 1 }, [100, 100, 200])).toBe(100);
expect(clampPosition({ spineIndex: 9, fraction: 2 }, 3)).toEqual({ spineIndex: 2, fraction: 1 });
expect(clampPosition({ spineIndex: -1, fraction: -1 }, 3)).toEqual({ spineIndex: 0, fraction: 0 });
const book = await readEpub(EPUB.epub3Nav());
expect(chapterForHref(book, 'OEBPS/text/ch3.xhtml#end')).toEqual({ spineIndex: 2, fragment: 'end' });
expect(chapterForHref(book, 'OEBPS/text/nope.xhtml')).toBeNull();
```

- [ ] **Step 2: Run, expect failure.** — **Step 3: Implement.** — **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "Map reading positions to pages"`

---

### Task 16: Chapter rendering with blob resources

**Files:**
- Create: `src/reader/resources.ts`, `src/reader/render.ts`
- Test: `tests/unit/reader/resources.test.ts`, `render.test.ts`

**Interfaces:**
- Produces:

```ts
export class ResourceUrls {
  constructor(book: Book, create?: (blob: Blob) => string, revoke?: (url: string) => void); // defaults: URL.createObjectURL / revokeObjectURL
  urlFor(key: string): string | null;   // null when the key is not a resource
  dispose(): void;                      // revokes every URL it created
}
export type Theme = 'light' | 'dark' | 'sepia';
export interface ReaderLook { fontSizePercent: number; theme: Theme }
export function buildSrcdoc(book: Book, index: number, urls: ResourceUrls, look: ReaderLook): string;
```

`urlFor` caches per key; a CSS resource is served as a `text/css` blob whose `url()`s and `@import`s have been rewritten through `urlFor` (missing → `about:invalid`). `buildSrcdoc` output: `<!doctype html>`, `<html data-theme="…">`, `<meta charset="utf-8">`, the CSP meta `default-src 'none'; img-src blob: data:; font-src blob: data:; style-src blob: 'unsafe-inline'`, one `<link rel="stylesheet">` per chapter stylesheet (blob URL), the chapter `inlineCss` (refs rewritten), then the reader `<style>` (theme colors as CSS custom properties, `font-size: <n>%` on `html`; colors are placeholders the UI plan will set), then the body. In the body: resource refs → blob URLs (missing removed); internal chapter links → `href="#"` plus `data-copista-href="<key>#<fragment>"`; external links → `href="#"` plus `data-copista-external="<url>"`.

- [ ] **Step 1: Write the failing tests.**

```ts
const book = await readEpub(EPUB.epub3Nav());
const created: Blob[] = []; const revoked: string[] = [];
const urls = new ResourceUrls(book, (b) => { created.push(b); return `blob:test/${created.length}`; }, (u) => revoked.push(u));
const img = urls.urlFor('OEBPS/images/cover.png');
expect(img).toMatch(/^blob:test\/\d+$/);
expect(urls.urlFor('OEBPS/images/cover.png')).toBe(img);
expect(urls.urlFor('missing.png')).toBeNull();
const css = urls.urlFor('OEBPS/css/book.css')!;
const cssBlob = created[Number(css.split('/')[1]) - 1]!;
expect(cssBlob.type).toBe('text/css');
expect(await cssBlob.text()).toMatch(/url\("blob:test\/\d+"\)/);

const html = buildSrcdoc(book, 1, urls, { fontSizePercent: 120, theme: 'sepia' });
expect(html).toMatch(/^<!doctype html>/i);
expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; font-src blob: data:; style-src blob: 'unsafe-inline'">`);
expect(html).toContain('data-theme="sepia"');
expect(html).toContain('font-size: 120%');
expect(html).toContain(`src="${img}"`);
expect(html).toContain('data-copista-href="OEBPS/text/ch3.xhtml#end"');
expect(html).toContain('data-copista-external="https://example.org/"');
expect(html).not.toContain('OEBPS/images/cover.png');
urls.dispose();
expect(revoked).toHaveLength(created.length);
```

- [ ] **Step 2: Run, expect failure.** — **Step 3: Implement.** — **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "Render chapters with blob resources"`

---

### Task 17: Paginator

**Files:**
- Create: `src/reader/paginator.ts`, `tests/harness/paginator.html`, `tests/harness/paginator.ts`
- Test: `tests/e2e/paginator.spec.ts`

**Interfaces:**
- Consumes: `buildSrcdoc`, `ResourceUrls`, `ReaderLook` (Task 16), `pageForFraction`, `fractionForPage` (Task 15).
- Produces:

```ts
export type ShowTarget = { fraction: number } | { fragment: string };
export class Paginator {
  constructor(host: HTMLElement, events: { onInternalLink(key: string): void });
  show(srcdoc: string, target: ShowTarget): Promise<void>;   // resolves after layout, fonts and images settle
  next(): boolean;   // false on the last page
  prev(): boolean;   // false on the first page
  readonly page: number;
  readonly pageCount: number;
  fraction(): number;
  relayout(): Promise<void>;   // keeps fraction(); also triggered by a ResizeObserver on host
  destroy(): void;
}
```

The paginator creates one `<iframe sandbox="allow-same-origin">` filling `host`, sets `srcdoc`, lays the body out in CSS columns one frame wide, turns pages by scrolling one column. It listens for clicks on the frame's document: `data-copista-href` → `onInternalLink`; `data-copista-external` → `window.open(url, '_blank', 'noopener,noreferrer')`. The harness page carries the app CSP meta and exposes `window.harness = { open(fixture, chapter, target, look), next(), prev(), info(), lastLink }`.

- [ ] **Step 1: Write the Playwright tests**, run on `chromium` and `webkit`, viewports 800×600 and 375×667:
  - `longChapter` shows `pageCount > 3` and `page === 0`.
  - `next()` advances one page at a time and returns `false` only on page `pageCount - 1`; `prev()` mirrors it.
  - `{ fraction: 0.5 }` lands on `pageForFraction(0.5, pageCount)`.
  - `{ fragment: 'end' }` lands on `pageCount - 1`.
  - Re-opening with `fontSizePercent: 200` gives a larger `pageCount`; after `relayout()` the fraction moves by at most `1 / pageCount`.
  - Resizing the viewport changes `pageCount` with no explicit call, fraction kept within `1 / pageCount`.
  - In `epub3Nav` chapter 2 the frame's `img` has `naturalWidth === 2`.
  - Clicking `next` in `epub3Nav` chapter 2 sets `lastLink` to `OEBPS/text/ch3.xhtml#end`; clicking `ext` calls a stubbed `window.open` with `('https://example.org/', '_blank', 'noopener,noreferrer')`.
  - `malicious`: after 500 ms the frame's `window.__pwned` is `undefined`, and `page.on('request')` saw no URL outside `http://localhost:5175`.
  - The iframe's `sandbox` attribute is exactly `allow-same-origin`.
- [ ] **Step 2: Run, expect failure** — `npx playwright test tests/e2e/paginator.spec.ts` → FAIL.
- [ ] **Step 3: Implement `Paginator` and the harness.**
- [ ] **Step 4: Run, expect pass** on both browsers and both viewports.
- [ ] **Step 5: Commit** — `git commit -m "Paginate chapters in a sandboxed frame"`

---

### Task 18: Storage

**Files:**
- Create: `src/storage/db.ts`
- Test: `tests/unit/storage/db.test.ts` (imports `fake-indexeddb/auto`)

**Interfaces:**
- Produces:

```ts
export interface BookRecord { id: string; title: string; authors: string[]; coverBlob?: Blob; fileBlob: Blob; addedAt: number }
export interface ProgressRecord { bookId: string; spineIndex: number; fraction: number; updatedAt: number }
export interface BookmarkRecord { id: string; bookId: string; spineIndex: number; fraction: number; snippet: string; createdAt: number }
export class StorageFullError extends CopistaError { readonly neededBytes: number }
export class BookNotFoundError extends CopistaError { readonly bookId: string }
export function putBook(rec: BookRecord): Promise<void>;
export function getBook(id: string): Promise<BookRecord | undefined>;
export function listBooks(): Promise<BookRecord[]>;          // newest addedAt first
export function deleteBook(id: string): Promise<void>;       // also its progress and bookmarks, one transaction
export function getProgress(bookId: string): Promise<ProgressRecord | undefined>;
export function putProgress(rec: ProgressRecord): Promise<void>;
export function listBookmarks(bookId: string): Promise<BookmarkRecord[]>;  // by spineIndex, then fraction
export function putBookmark(rec: BookmarkRecord): Promise<void>;
export function deleteBookmark(id: string): Promise<void>;
export function getSetting<T>(key: string): Promise<T | undefined>;
export function putSetting(key: string, value: unknown): Promise<void>;
export function deleteAllStorage(): Promise<void>;           // closes the connection and deletes the database
```

Database `copista`, version 1, stores exactly as spec 6.6: `books` (key `id`), `progress` (key `bookId`), `bookmarks` (key `id`, index `byBook` on `bookId`), `settings` (key `key`). One lazily opened connection, reset by `deleteAllStorage`. A `QuotaExceededError` from any write becomes `StorageFullError` with `neededBytes` = the sizes of the record's blobs.

- [ ] **Step 1: Write the failing tests** (`beforeEach(deleteAllStorage)`):

```ts
it('creates the spec schema', async () => {
  await listBooks();
  const db = await new Promise<IDBDatabase>((r) => { const q = indexedDB.open('copista'); q.onsuccess = () => r(q.result); });
  expect(db.version).toBe(1);
  expect([...db.objectStoreNames].sort()).toEqual(['bookmarks', 'books', 'progress', 'settings']);
  db.close();
});
it('stores and lists books newest first', async () => {
  await putBook({ id: 'a', title: 'A', authors: [], fileBlob: new Blob(['aa']), addedAt: 1 });
  await putBook({ id: 'b', title: 'B', authors: [], fileBlob: new Blob(['bb']), addedAt: 2 });
  expect((await listBooks()).map((b) => b.id)).toEqual(['b', 'a']);
  expect(await (await getBook('a'))!.fileBlob.text()).toBe('aa');
});
it('deletes a book with its progress and bookmarks only', async () => { /* two books, progress and bookmarks for each; delete 'a'; 'b' data intact */ });
it('orders bookmarks by spine index then fraction', async () => { /* (1,0.5) (0,0.9) (1,0.1) -> (0,0.9) (1,0.1) (1,0.5) */ });
it('round-trips settings', async () => {
  expect(await getSetting('theme')).toBeUndefined();
  await putSetting('theme', 'dark');
  expect(await getSetting('theme')).toBe('dark');
});
it('turns a quota error into StorageFullError and keeps the library unchanged', async () => {   // Review Focus 5
  await putBook({ id: 'a', title: 'A', authors: [], fileBlob: new Blob(['aa']), addedAt: 1 });
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
  await expect(putBook({ id: 'b', title: 'B', authors: [], fileBlob: new Blob(['12345']), addedAt: 2 }))
    .rejects.toMatchObject({ name: 'StorageFullError', neededBytes: 5 });
  spy.mockRestore();
  expect((await listBooks()).map((b) => b.id)).toEqual(['a']);
});
it('deleteAllStorage empties everything and the database reopens', async () => { /* put book, setting; delete; listBooks() -> [] */ });
```

- [ ] **Step 2: Run, expect failure.** — **Step 3: Implement with `idb`.** — **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "Store books, progress and settings in IndexedDB"`

---

### Task 19: Bibliotheca (Library) service

**Files:**
- Create: `src/rooms/bibliotheca/index.ts`
- Test: `tests/unit/rooms/bibliotheca.test.ts`

**Interfaces:**
- Consumes: `readEpub`, `detectFormat`, `sha256Hex`, storage functions.
- Produces:

```ts
export interface ShelfBook { id: string; title: string; authors: string[]; coverBlob?: Blob; addedAt: number }
export interface ImportResult { book: ShelfBook; alreadyPresent: boolean; warnings: BookWarning[] }
export function importBook(file: File): Promise<ImportResult>;
export function listShelf(): Promise<ShelfBook[]>;
export function removeBook(id: string): Promise<void>;
```

`importBook`: read bytes → `detectFormat`; anything but `epub` → `UnsupportedFormatError(format)` (the UI will point to the Scriptorium) → `sha256Hex` → if the id exists, return it with `alreadyPresent: true` and change nothing → `readEpub(bytes, { fileName })` (errors propagate) → `putBook` with `coverBlob` typed by the cover's media type and `fileBlob` typed `application/epub+zip` → on the first successful import ever, call `navigator.storage.persist()` when it exists and record setting `persistRequested = true`.

- [ ] **Step 1: Write the failing tests** (fake IndexedDB, `beforeEach(deleteAllStorage)`, `navigator.storage` stubbed with `persist: vi.fn(async () => true)`):

```ts
const file = (data: Uint8Array, name: string) => new File([data], name);
const r = await importBook(file(EPUB.epub3Nav(), 'three.epub'));
expect(r.alreadyPresent).toBe(false);
expect(r.book).toMatchObject({ title: 'Fixture Three', authors: ['Ada Example', 'Bo Sample'], id: await sha256Hex(EPUB.epub3Nav()) });
expect(r.book.coverBlob!.type).toBe('image/png');
await putProgress({ bookId: r.book.id, spineIndex: 2, fraction: 0.5, updatedAt: 1 });
expect((await importBook(file(EPUB.epub3Nav(), 'copy.epub'))).alreadyPresent).toBe(true);
expect(await listShelf()).toHaveLength(1);
expect(await getProgress(r.book.id)).toMatchObject({ spineIndex: 2, fraction: 0.5 });
await importBook(file(EPUB.noCover(), 'b.epub'));
expect(navigator.storage.persist).toHaveBeenCalledTimes(1);
await expect(importBook(file(EPUB.drmAdept(), 'd.epub'))).rejects.toBeInstanceOf(DrmProtectedError);
await expect(importBook(file(DOCX.basic(), 'x.docx'))).rejects.toMatchObject({ format: 'docx' });
expect(await listShelf()).toHaveLength(2);
expect((await importBook(file(EPUB.fixedLayout(), 'f.epub'))).warnings).toContain('fixed-layout');
await removeBook(r.book.id);
expect((await listShelf()).map((b) => b.id)).not.toContain(r.book.id);
```

Plus: with `putBook` mocked to reject with `StorageFullError`, `importBook` rejects with it and `listShelf()` is unchanged (Review Focus 5).

- [ ] **Step 2: Run, expect failure.** — **Step 3: Implement.** — **Step 4: Run, expect pass** (architecture test included).
- [ ] **Step 5: Commit** — `git commit -m "Add the Bibliotheca service"`

---

### Task 20: Lectorium (Reading room) service

**Files:**
- Create: `src/rooms/lectorium/index.ts`, `src/rooms/lectorium/controller.ts`, `tests/harness/lectorium.html`, `tests/harness/lectorium.ts`
- Test: `tests/unit/rooms/lectorium.test.ts`, `tests/e2e/lectorium.spec.ts`

**Interfaces:**
- Consumes: storage functions, `readEpub`, `clampPosition`, `bookPercent`, `chapterForHref`, `Paginator`, `ResourceUrls`, `buildSrcdoc`.
- Produces:

```ts
export interface ReadingSession { bookId: string; book: Book; position: Position; bookmarks: BookmarkRecord[] }
export function openSession(bookId: string): Promise<ReadingSession>;     // BookNotFoundError if absent; position clamped, default {0,0}
export function savePosition(bookId: string, pos: Position): Promise<void>;
export function addBookmark(bookId: string, pos: Position, snippet: string): Promise<BookmarkRecord>;  // whitespace collapsed, max 120 chars
export function removeBookmark(id: string): Promise<void>;
export function progressPercent(book: Book, pos: Position): number;      // bookPercent over chapter html lengths
// controller.ts (browser only)
export class ReadingController {
  constructor(host: HTMLElement, session: ReadingSession, look: ReaderLook, onChange?: (pos: Position, percent: number) => void);
  open(): Promise<void>;
  next(): Promise<boolean>;   // crosses into the next chapter at page 0; false at the end of the book
  prev(): Promise<boolean>;   // crosses into the previous chapter's last page; false at the start
  goTo(target: { spineIndex: number; fraction?: number; fragment?: string }): Promise<void>;
  setLook(look: ReaderLook): Promise<void>;   // keeps the position
  position(): Position;
  destroy(): void;
}
```

The controller saves the position with `savePosition` after every move, follows internal links through `chapterForHref`, and disposes the `ResourceUrls` on `destroy`.

- [ ] **Step 1: Write the unit tests** (fake IndexedDB): unknown id → `BookNotFoundError`; new book → position `{ spineIndex: 0, fraction: 0 }`; stored `{ spineIndex: 9, fraction: 2 }` on a 3-chapter book → `{ spineIndex: 2, fraction: 1 }`; `savePosition` then `openSession` returns it; `addBookmark` with `'  a\n\n b ' + 'x'.repeat(300)` stores a snippet of length 120 starting `'a b x'`; bookmarks come back ordered; `removeBookmark` removes one; `progressPercent` equals `bookPercent` on the chapter lengths.
- [ ] **Step 2: Write the Playwright tests** (Chromium and WebKit; the harness stores `epub3Nav` with `putBook` and builds a controller): `next()` from the last page of chapter 0 lands on `{ spineIndex: 1 }` page 0; `prev()` from page 0 of chapter 1 lands on the last page of chapter 0; `next()` on the last page of the last chapter returns `false`; `goTo({ spineIndex: 1, fragment: 's21' })` shows the page holding `#s21`; after a page reload and a new `openSession`, the controller opens on the same `spineIndex` and page; `setLook({ fontSizePercent: 160, theme: 'dark' })` keeps `spineIndex` and moves the fraction by at most one page.
- [ ] **Step 3: Run, expect failure.** — **Step 4: Implement.** — **Step 5: Run, expect pass** — `npm test && npx playwright test tests/e2e/lectorium.spec.ts`.
- [ ] **Step 6: Commit** — `git commit -m "Add the Lectorium service"`

---

### Task 21: Scriptorium (Convert) service

**Files:**
- Create: `src/rooms/scriptorium/index.ts`
- Modify: `tests/harness/engine.ts` (add `convert`), `tests/e2e/engine.spec.ts`
- Test: `tests/unit/rooms/scriptorium.test.ts`

**Interfaces:**
- Consumes: `detectFormat`, `readEpub`, `fromDocx`, `fromTxt`, `fromMarkdown`, `parseFrontMatter`, `decodeText`, `writeEpub`, `toDocx`, `toMarkdown`, `toText`, `toHtml`.
- Produces:

```ts
export type OutputFormat = 'epub' | 'docx' | 'md' | 'txt' | 'html' | 'pdf';
export type ConvertOutput = { kind: 'file'; blob: Blob; fileName: string } | { kind: 'print'; html: string };
export function inspect(file: File): Promise<{ format: InputFormat; needsMeta: boolean; targets: OutputFormat[] }>;
export function convert(file: File, target: OutputFormat, meta?: Partial<NewBookMeta>): Promise<ConvertOutput>;
export function convertBook(book: Book, target: OutputFormat): Promise<ConvertOutput>;
export function outputFileName(title: string, target: Exclude<OutputFormat, 'pdf'>): string;
```

`targets`: all six formats minus the input's own (`md` input drops `md`, `txt` drops `txt`, `epub` drops `epub`, `docx` drops `docx`). `needsMeta`: `true` for `txt`, and for `md` without a front-matter `title`. Missing meta falls back to the file name without extension and author `Unknown`, so `convert` never fails for lack of metadata. MIME types: `application/epub+zip`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/markdown;charset=utf-8`, `text/plain;charset=utf-8`, `text/html;charset=utf-8`. `pdf` → `{ kind: 'print', html: toHtml(book, { print: true }) }`; the UI plan opens it and calls `print()`. `outputFileName`: characters `\ / : * ? " < > |` and control characters become `-`, whitespace collapsed, trimmed, cut to 100 characters, empty → `book`, then `.<ext>`.

- [ ] **Step 1: Write the failing tests.**

```ts
const f = (d: Uint8Array, n: string) => new File([d], n);
expect(await inspect(f(enc('# T'), 'a.md'))).toEqual({ format: 'md', needsMeta: true, targets: ['epub', 'docx', 'txt', 'html', 'pdf'] });
expect((await inspect(f(enc('---\ntitle: X\n---\n# T'), 'a.md'))).needsMeta).toBe(false);
expect(await inspect(f(EPUB.epub3Nav(), 'b.epub'))).toEqual({ format: 'epub', needsMeta: false, targets: ['docx', 'md', 'txt', 'html', 'pdf'] });
const docx = await convert(f(EPUB.epub3Nav(), 'b.epub'), 'docx');
expect(docx).toMatchObject({ kind: 'file', fileName: 'Fixture Three.docx' });
if (docx.kind !== 'file') throw new Error('expected a file');
expect(docx.blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
expect((await fromDocx(new Uint8Array(await docx.blob.arrayBuffer()))).chapters).toHaveLength(3);
const epub = await convert(f(enc('CHAPTER I\n\nHi.'), 'night.txt'), 'epub', { title: 'Night', author: 'Ada Example' });
if (epub.kind !== 'file') throw new Error('expected a file');
expect(epub.fileName).toBe('Night.epub');
expect((await readEpub(new Uint8Array(await epub.blob.arrayBuffer()))).meta.title).toBe('Night');
const untitled = await convert(f(enc('Hi.'), 'notes.txt'), 'epub');
expect(untitled.kind === 'file' && untitled.fileName).toBe('notes.epub');
const pdf = await convert(f(EPUB.epub3Nav(), 'b.epub'), 'pdf');
expect(pdf.kind === 'print' && pdf.html.includes('@page')).toBe(true);
expect(outputFileName('A/B: C?', 'epub')).toBe('A-B- C-.epub');
expect(outputFileName('   ', 'txt')).toBe('book.txt');
await expect(convert(f(EPUB.drmAdept(), 'd.epub'), 'docx')).rejects.toBeInstanceOf(DrmProtectedError);
await expect(convert(f(OTHER.legacyDoc(), 'old.doc'), 'epub')).rejects.toMatchObject({ format: 'doc' });
```

- [ ] **Step 2: Run, expect failure.** — **Step 3: Implement.** — **Step 4: Run, expect pass.**
- [ ] **Step 5: Browser parity.** Add `convert` to `window.engine`; in `engine.spec.ts`, for both browsers convert `epub3Nav` to each of `docx`, `md`, `txt`, `html`, `pdf`, and `DOCX.basic`, a `.md` and a `.txt` to `epub`; each `file` output must be non-empty and each EPUB must reopen with `readEpub` in the page. This is where mammoth's browser build gets exercised.
- [ ] **Step 6: Run, expect pass** — `npm test && npm run test:e2e`.
- [ ] **Step 7: Commit** — `git commit -m "Add the Scriptorium service"`

---

### Task 22: Archivum (Settings & privacy) service

**Files:**
- Create: `src/rooms/archivum/index.ts`
- Test: `tests/unit/rooms/archivum.test.ts`

**Interfaces:**
- Consumes: `getSetting`, `putSetting`, `deleteAllStorage`; `Theme` from `src/reader/render.ts`.
- Produces:

```ts
export interface Settings { fontSizePercent: number; theme: Theme }
export const DEFAULT_SETTINGS: Settings;   // { fontSizePercent: 100, theme: 'light' }
export function getSettings(): Promise<Settings>;
export function updateSettings(patch: Partial<Settings>): Promise<Settings>;
export function storageUsage(): Promise<{ usedBytes: number; quotaBytes: number } | null>;
export function deleteAllData(): Promise<void>;
```

`updateSettings`: `fontSizePercent` rounded to the nearest 10 and clamped to 80–200; an unknown `theme` keeps the stored one. `storageUsage`: `navigator.storage.estimate()`, `null` when unavailable. `deleteAllData`: `deleteAllStorage()`, then every key of `caches` deleted when `caches` exists.

- [ ] **Step 1: Write the failing tests.**

```ts
expect(await getSettings()).toEqual({ fontSizePercent: 100, theme: 'light' });
expect((await updateSettings({ fontSizePercent: 250 })).fontSizePercent).toBe(200);
expect((await updateSettings({ fontSizePercent: 73 })).fontSizePercent).toBe(80);
expect((await updateSettings({ fontSizePercent: 117 })).fontSizePercent).toBe(120);
await updateSettings({ theme: 'dark' });
expect((await updateSettings({ theme: 'neon' as Theme })).theme).toBe('dark');
expect(await getSettings()).toEqual({ fontSizePercent: 120, theme: 'dark' });
vi.stubGlobal('navigator', { storage: { estimate: async () => ({ usage: 10, quota: 100 }) } });
expect(await storageUsage()).toEqual({ usedBytes: 10, quotaBytes: 100 });
vi.stubGlobal('navigator', {});
expect(await storageUsage()).toBeNull();
const del = vi.fn(async () => true);
vi.stubGlobal('caches', { keys: async () => ['a', 'b'], delete: del });
await putBook({ id: 'x', title: 'X', authors: [], fileBlob: new Blob(['x']), addedAt: 1 });
await deleteAllData();
expect(await listBooks()).toEqual([]);
expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
expect(del.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
vi.unstubAllGlobals();
await expect(deleteAllData()).resolves.toBeUndefined();   // no caches global
```

- [ ] **Step 2: Run, expect failure.** — **Step 3: Implement.** — **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "Add the Archivum service"`

---

### Task 23: Engine acceptance

**Files:**
- Modify: `vitest.config.ts` (coverage), `.claude/commit-checks`, `.github/workflows/ci.yml`, `DEVLOG.md`, `docs/design/2026-10-08-design.md` (section 11)

- [ ] **Step 1: Coverage gate.** `@vitest/coverage-v8` over `src/core`, `src/reader`, `src/storage`, `src/rooms`, excluding the browser-only `src/reader/paginator.ts` and `src/rooms/lectorium/controller.ts` (covered by Playwright); thresholds 90% lines, 80% branches. Add `npm test -- --coverage` to CI.
- [ ] **Step 2: Run everything** and record each command's result: `npm run lint`, `npm run typecheck`, `npm test -- --coverage`, `npm run test:corpus`, `npm run test:e2e`, `npm run licenses`, `npm run epubcheck -- --corpus`. A failure is reported with its output before anything else.
- [ ] **Step 3: DEVLOG entry** with the measured numbers: tests per suite, coverage, corpus books passed, EPUBCheck result, time to open `bigEpub` in each browser.
- [ ] **Step 4: Spec section 11:** mark the engine milestones done and name the next plan, "rooms UI".
- [ ] **Step 5: Commit** — `git commit -m "Record engine test results"`
- [ ] **Step 6: Whole-branch review** before starting the UI plan.
