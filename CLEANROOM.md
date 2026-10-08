# Clean-room notes

Copista is written from public specifications and from the documentation of
the libraries it uses. This file records the rules and every source consulted.

## Rules

- No decompiling, disassembling or inspecting other e-book software.
- No copying of code, icons, graphics, text, trademarks or other assets from
  other products.
- The source code of other e-book readers and converters (Calibre, Foliate,
  epub.js, Readium, pandoc and similar) is not opened while working on Copista.
- Allowed sources: published standards and specifications, MDN, and the
  documentation of each library Copista depends on.
- Runtime dependencies are open source under licenses compatible with MIT
  (MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, Zlib, or an `OR`
  expression containing one of them). `npm run licenses` checks this.
- The name, logo and visual design are original.
- If a choice looks risky for copyright or trademark, work stops until the
  project owner decides.

## Sources

Each entry names the document and what it was used for.

- W3C, _EPUB 3.3_ (https://www.w3.org/TR/epub-33/): package document, navigation
  document, fixed-layout metadata; test fixtures and the EPUB reader.
- W3C, _EPUB Open Container Format 3.3_ (section of EPUB 3.3): container.xml,
  the mimetype file, encryption.xml and font obfuscation.
- IDPF, _Open Packaging Format 2.0.1_ and DAISY _NCX_ (Z39.86-2005): EPUB 2
  package and NCX table of contents.
- Ecma International, _ECMA-376 Office Open XML_, Parts 1 and 2: .docx package
  structure, WordprocessingML paragraphs, runs, numbering and inline pictures.
- RFC 3986 (URI syntax) and the WHATWG URL Standard: resolving relative hrefs.
- W3C PNG specification (third edition): the minimal PNG writer used by tests.
- DOMPurify README and its hook documentation (https://github.com/cure53/DOMPurify):
  configuring the HTML sanitizer.
- MDN Web Docs, CSS `url()`, `@import` and the `srcset` attribute: what the
  sanitizer has to inspect for references outside the book.

## Test corpus

`npm run test:corpus` downloads 25 public-domain books listed in
`tests/corpus.json` and checks that the reader opens each of them. The files
are not stored in the repository.

- Standard Ebooks (https://standardebooks.org), 20 titles. Standard Ebooks
  dedicates its own work on each edition to the public domain under CC0 1.0;
  the underlying texts are in the public domain in the USA.
- Project Gutenberg (https://www.gutenberg.org), 5 titles, fetched from the
  Project Gutenberg Literary Archive Foundation server `gutenberg.pglaf.org`,
  which serves the same files. The texts are in the public domain in the USA
  and are distributed under the Project Gutenberg License.
