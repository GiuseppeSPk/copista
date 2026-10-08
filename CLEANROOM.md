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
