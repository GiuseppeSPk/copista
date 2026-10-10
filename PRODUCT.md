# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two groups with equal weight:

- everyday readers who have EPUB files and want to read or convert them at
  once, with nothing to install;
- students and researchers who work with texts and convert them to Word,
  Markdown or plain text to quote, annotate and study.

Phone and desktop matter equally.

## Product Purpose

Copista reads and converts e-books in the browser. Converting is the most
frequent task; reading is the second. Success is a user who gets the file they
need, or reaches the page they were reading, in a few seconds and without
having to think about where things are.

## Positioning

Everything happens on the user's device: no server, no account, no analytics,
no request to any third party. The app is free, open source (MIT) and works
offline once loaded. The privacy claim can be checked, not only promised.

## Operating Context

- Installable web app (PWA), used online or offline.
- Four rooms, each with one job:
  - Bibliotheca: the library of EPUB books kept in the browser, with links
    to free public-domain libraries (Standard Ebooks, Project Gutenberg,
    Liber Liber, Wikisource);
  - Lectorium: paged reading with contents, bookmarks, notes pinned to a
    page, text size and page colours; pages turn by tap, swipe or arrow key,
    a tap in the middle fits the page to the window, and it remembers the
    position;
  - Scriptorium: conversion between EPUB, Word (.docx), Markdown, plain text,
    a single web page, and PDF through the print dialog; each copy is read
    back and checked against the original, and the user sees what arrived
    and what the format left out;
  - Archivum: reading settings, space used, and deleting all stored data.
- A file can be dropped in any room and lands in the right one.

## Capabilities and Constraints

- No PDF to EPUB. PDF output goes through the browser's print dialog; a
  direct PDF writer is an open decision.
- DRM-protected books cannot be opened, and the user is told so.
- English interface.
- Clean-room project: no copied code, assets or trademarks from other
  readers or converters.
- Strict content security policy: nothing is loaded from outside the site,
  including fonts.
- The free libraries are only linked: each link opens the site in a new tab,
  Copista sends it nothing and fetches nothing from it. The reader downloads
  the EPUB there and drops it in, where it is kept like any other book.

## Brand Commitments

- Name: Copista, the scribe who carried a text from one medium to another.
  Trademark registers not yet checked.
- Rooms named after the parts of a monastery: Bibliotheca, Lectorium,
  Scriptorium, Archivum.
- The user's interface idea (2026-10-09): moving between rooms should feel
  like a dash in a video game, a quick transition; each room's interior
  should have its own character; the app must feel very responsive, every
  function clear, every task fast; and it needs a mark that makes it
  recognisable at a glance.
- The user's redesign brief (2026-10-10): violet on light paper and a warm,
  strong gold in the dark (not orange, not a saturated yellow), with a
  theme switch; rooms labelled by what you do there, in short words; each
  room opens with its Latin name set large in Cinzel, what it is and what
  can be done there; animations visible, also on click; a professional look
  that does not read as machine-made; a GitHub star invite that asks for
  no data. Later the same day the light theme's violet became a rubric red.
- Cinzel is bundled with the app (SIL Open Font License, admitted by the
  licence check), so the strict content security policy still holds.

## Evidence on Hand

- Test fixtures in `tests/fixtures/generated/` (generated EPUB, .docx,
  Markdown and text files).
- No users, testimonials, screenshots or illustrations yet. None may be
  invented.

## Product Principles

1. The task comes first: converting or reading is one or two actions away
   from wherever the user is.
2. Privacy is a fact the interface shows, not a slogan.
3. Speed is felt: every action answers at once, motion never makes the user
   wait.
4. Each room is recognisable by its job and its character.

## Accessibility & Inclusion

- No serious or critical axe findings in any room (checked by the browser
  tests).
- Motion is reduced or removed when the user asks for reduced motion.
- Every function works from the keyboard.
