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
