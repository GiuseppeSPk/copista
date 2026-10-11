---
name: Copista
description: A building of four rooms with Latin names, for reading and converting books in the browser.
colors:
  paper: '#f6f4ef'
  card: '#ffffff'
  ink: '#1f1a17'
  muted: '#5f5751'
  line: '#e6dfd6'
  line-strong: '#cdc2b6'
  control: '#8f8479'
  accent: '#a3241c'
  accent-ink: '#ffffff'
  wash: '#f7ebe5'
  red: '#c8322b'
  paper-dark: '#110f0d'
  card-dark: '#1b1815'
  ink-dark: '#f1ece6'
  muted-dark: '#a89f95'
  line-dark: '#2c2723'
  line-strong-dark: '#463e37'
  control-dark: '#6f665d'
  accent-dark: '#f2c14e'
  accent-ink-dark: '#1a1406'
  wash-dark: '#2a2210'
  red-dark: '#ff7a70'
typography:
  display:
    fontFamily: "'Cinzel Variable', 'Cinzel', 'Trajan Pro', Georgia, serif"
    fontWeight: 600
    letterSpacing: '0.04em'
  brand:
    fontFamily: "'Cinzel Variable', 'Cinzel', 'Trajan Pro', Georgia, serif"
    fontSize: '19px'
    fontWeight: 650
    letterSpacing: '0.06em'
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '16px'
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '14px'
    fontWeight: 600
    lineHeight: '20px'
  stamp:
    fontFamily: "'Cinzel Variable', 'Cinzel', 'Trajan Pro', Georgia, serif"
    fontSize: '20px'
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: '0.14em'
  caption:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '12px'
    fontWeight: 400
rounded:
  cover: '4px'
  stamp: '6px'
  control: '8px'
  card: '12px'
  ticket: '14px'
  door: '18px'
  pill: '999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
  xxl: '32px'
components:
  button:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '7px 14px'
    height: '36px'
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-ink}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '7px 14px'
    height: '36px'
  button-danger:
    backgroundColor: '{colors.card}'
    textColor: '{colors.red}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '7px 14px'
    height: '36px'
  door:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.door}'
    padding: '24px'
  book-card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '10px 10px 12px'
  ticket:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.ticket}'
  stamp:
    textColor: '{colors.accent}'
    typography: '{typography.stamp}'
    rounded: '{rounded.stamp}'
    padding: '10px 18px 8px'
  masthead:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    height: '64px'
---

# Design System: Copista

## Overview

**Creative North Star: "Four rooms with names cut in stone"**

Copista is a small building. The home page is its hall: the name, one line on what the app does, and four doors. Each door says what you do behind it ("Convert a file", "Read a book", "Keep your books", "Manage your data") and carries a small plaque with the room's Latin name. Going through a door, the plaque grows into the room's name, set large in Cinzel across the top of the room. Every finished conversion still gets the Copista stamp, and the stamp is also the brand mark and the app icon.

The rooms are working tools. The hall and the room openings may be generous; the interiors stay plain, dense and quick to use.

**Key Characteristics:**

- One accent per theme: rubric red on light paper, lamp gold in the dark. It marks state and the action that matters.
- Cinzel, cut from Roman inscriptions, for names only: the brand, room names, plaques, the stamp's word. Everything else is the platform sans.
- In the dark the accent also draws the frames of cards and doors, so the boxes read as lit edges on black.
- Motion is visible but short: the name of a room travels between door and page, pressed controls send a ring out, the theme changes in a widening circle.
- Phones get the rooms in a bottom bar within thumb reach.

## Colors

A closed palette: paper, card and ink neutrals, one accent, one red. Both themes keep the same roles. The theme follows the system until the switch in the top bar is used; the choice is kept on the device.

### Accent

- **Accent** (accent; dark: accent-dark): the first letter of the brand and of every room name, the brand mark, the open tab and the dash under it, the primary button, the stamp, focus rings, selection and the text caret. Light: rubric red `#a3241c`, the red of a manuscript's initials and headings, deep enough to carry white text. Dark: gold `#f2c14e`, warm and strong but not saturated, chosen to sit on near-black.
- **Accent Ink** (accent-ink; dark: accent-ink-dark): text on an accent fill. White on red; near-black `#1a1406` on gold.
- **Wash** (wash; dark: wash-dark): the quiet tint behind a chosen file and behind a book with no cover.

### Frames

- **Frame**, **Frame Strong**, **Frame Hover**: the borders of doors, cards, the ticket and tags. On paper they are quiet rules from the line greys. In the dark they are the gold at 34% and 52% over the card, and full gold on hover.

### Tertiary

- **Red** (red; dark: red-dark): error messages and the destructive action only. It is brighter than the accent, and an error always says in words what went wrong, so the two reds are never the only signal.

### Neutral

- **Paper**: the page ground and the top bar. Warm off-white, and the light greys around it lean warm too, toward the red; in the dark a warm near-black, not blue-grey, so the gold reads as lamplight.
- **Card**: doors, book cards, the ticket, controls.
- **Ink**: text, and the border of a hovered control.
- **Muted**: hints, authors, the lists of what a room can do.
- **Line** and **Line Strong**: rules between parts, the ledger's double top rule.
- **Control**: the resting border of buttons, selects and text fields, kept at 3:1 against the card.

**The Accent Rule.** The accent means "this is where you are", "do this" or "this is done", plus the first letter of a name. If an element is none of these, it is not red or gold. In the dark, frames are the one extra use.

**The Red Ink Rule.** Red appears only for errors and for deleting. It never decorates.

## Typography

**Display Font:** Cinzel (variable), bundled with the app from `@fontsource-variable/cinzel` under the SIL Open Font License; no font is loaded from the network.
**Interface Font:** the platform UI sans (system-ui with platform fallbacks).

### Hierarchy

- **Room name** (Cinzel 500, letter-spacing 0.1em): one per room, on one line, set like an inscription rather than a headline. Its size is `min(56px, 100cqi / 8.2)` against the room's opening, so the longest name, Scriptorium (about 7.9em wide with this spacing), always fits and every room shares that size. It never wraps or clips, at any zoom.
- **Home name** (Cinzel 500, `clamp(40px, 5.2vw, 64px)`, letter-spacing 0.1em): "Copista" in the hall. Display names stay within about three times the brand, so the top bar and the page read as one hand.
- **Brand** (Cinzel 650, 19px, letter-spacing 0.06em): the name beside the mark in the top bar.
- **Plaque** (Cinzel 600, 15px): the Latin name on each door.
- **Title** (16px, 700): section headings inside a room and the From / To / Done legs of the ticket. Door titles are 22px, the convert door 24px. The free libraries heading is Cinzel 500, 22px, letter-spacing 0.08em.
- **Body** (16px, 400): leads, room descriptions, privacy prose, ledger values.
- **Label** (14px, 600): buttons, tab labels, form labels. Tabs never wrap.
- **Caption** (12px): tags and the stamp date.
- **Stamp** (Cinzel 800, 20px, uppercase, letter-spacing 0.14em): the stamp's word only.

The first letter of the home name and of every room name takes the accent.

**The Tabular Count Rule.** Counts, sizes and dates use tabular numerals so they line up in the ledger and on the stamp.

## Layout

- An 8px grid; reused gaps are 4, 8, 12, 16 and 24px.
- Rooms and the hall sit in a centred column up to 1120px wide. The Archivum narrows to 800px because it is mostly reading.
- The top bar is 64px and sticky: the mark and brand, four tabs labelled by action with an icon, then the GitHub star link and the theme switch. It has no bottom rule in the hall.
- The hall is one view on a desktop: a centred frontispiece (the name, a short ruled line with the accent at its centre, a one-line promise in the book serif italic ending in "See how it works", then the lead) under a soft pool of accent light, then the four doors side by side at the same height, then the first line and the draw, then the guide, then a short colophon with the GitHub star. Below 860px the doors go two by two; below 560px one under another, with a low arch.
- A room opens with its hero: a "All rooms" link back, the Latin name, then the description and a short checked list of what can be done there, side by side. They stack at 860px and below.
- Tabs lose their icons at 1000px and below and switch to one short word each (Books, Read, Convert, Data) at 860px and below, which also covers zoomed-in desktop windows.
- At 700px and below the tabs leave the top bar and become a fixed bottom bar with an icon over the short word; the room column gets matching bottom padding.
- The shelf is an auto-fill grid with 168px minimum columns. At 560px and below each book becomes a list row.
- Below the shelf, the free libraries are rows of three columns: a fan of four covers, the name and what the site offers, and a Visit or Search link. The link moves under the text at 860px and below; at 560px and below the row stacks.
- The ticket is three columns (From, To, Done) and stacks at 860px and below.
- The Lectorium's contents panel is a 240px column on wide screens and an overlay on phones.
- No page scrolls sideways at any width or zoom, and no word is split across lines.

**The One Line Rule.** The Scriptorium reads left to right as one journey: what you have, what you want, what you got. Do not add a fourth leg or a side panel.

## Elevation & Depth

Mostly flat. Depth comes from the paper / card contrast and 1px frames. Doors lift 3px on hover with one soft shadow, and their border catches the light where the pointer is (a radial accent gradient masked to the 1px edge). Nothing else gets a drop shadow.

**The Flat Drawer Rule.** No drop shadows on cards, the ticket or menus. If something must stand out, give it a stronger frame or the wash.

## Shapes

Rounded rectangles: 3px on the spine and 5px on the fore-edge for typographic covers (72px wide, 2:3), 4px for miniature covers, 6px for the stamp and tags, 8px for controls, 12px for book cards, 14px for the ticket and for the doors' lower corners. Doors are topped with a round arch: half the door's width, capped at 132px, so wide doors get a slightly flattened arch. Round buttons (the star, the theme switch, a door's arrow) are pills. The ticket's leg separators are 1px dashed rules with half-circle notches at each end, like a perforation. The stamp is rotated -6 degrees.

## Motion

All motion uses one exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`). Entrances run around 600 to 1100ms, exits about 250ms. The one exception is a book falling onto a shelf, which speeds up as it drops, as weight does.

- **Hall entrance:** the light behind the name widens in, the name is inscribed (letter-spacing closes, blur clears, about 1s), the ruled line draws out from its centre, and the lead and the doors rise in one after another.
- **Into a room:** the plaque on the door grows into the room's name (a view transition); the rest of the page fades down and the room rises in. Back to the hall, the name shrinks into its plaque. A press during the change finishes it at once and the click lands on what is under the pointer, so no click is lost to the animation.
- **Between rooms:** the new room slides in from the side of the tab that was picked; the dash under the tabs slides to the open one.
- **Room opening:** the description and the list of what can be done rise in after the name.
- **Press:** a pressed button, tab or door sends a faint ring out from the point of the press and dips to 97%.
- **Theme switch:** the new theme is revealed in a circle growing from the switch.
- **The stamp** presses in once per finished job (240ms).
- **Cover fan:** the covers sit slightly turned; a pointed or focused cover straightens and lifts 8px.
- **Lamp:** once the hall's pool of light has come up, it burns unevenly: a 9-second cycle between 80% and full opacity. Off under reduced motion.
- **First line:** a new line rises in 600ms when the reader asks for another.
- **Bookcase:** the spines rise in one after another; a pointed or focused spine lifts 8px off its plank, taking its ribbon with it. The other books slide aside to make room for a new one.
- **Turn hints:** when a book opens or the page is fitted, round chevrons show for 1.8s on the page's outer thirds, the tap zones; with a mouse, the one under the pointer shows.
- **Note:** a note pinned to a page comes down onto it, turning slightly (340ms).
- **Landing:** a book just added (from the library or dropped on the Lectorium's shelf) falls from above the shelf onto the plank, tips on its lower corner and settles (940ms); a little dust spreads along the plank at the impact. Several fall one after another, 160ms apart. On an empty shelf an example book, "Your book", lands in the gap 1.5s after the room opens and pushes upright the outline that was leaning into it.
- **The draw:** each line of the dialogue rises in 600ms, and the answers after it 35ms apart. The three cards are dealt from the middle of the pack, turning slightly as they go, 90ms apart (760ms). A pointed card lifts 6px and leans; the picked one turns over (900ms, 3D), the other two sink and fade. Once it has landed, the card glides into its place beside the result (a view transition, 700ms), the words rise in, and the stamp presses on the card 760ms later. The stamp presses only on a draw made in this visit: a reload finds it already there. Under reduced motion the card turns face up at once and nothing travels.
- **Shelf demo:** the empty library shows the same thing small and on a loop (5.2s): an EPUB sheet comes down over a gap among four outlines, turns into a red spine and lands. Off under reduced motion, where the red spine simply stands among the others.

Under reduced motion everything still changes, but nothing travels: no transitions, no rings, no press.

## Components

### Buttons

- **Default:** card background, ink text, 1px control-coloured border, 36px minimum height, 8px radius. Hover darkens the border to ink.
- **Primary:** accent fill with accent-ink text. One per screen region: "Choose a file to convert" in the hall, "Add EPUB books" in the library and over the bookcase, "Choose a file", "Read" on a book card. The hall's two actions sit under the lead, the convert button primary and Add EPUB books default, each with its icon.
- **Reader tools:** default buttons with an icon and a short name (Contents, Bookmark, Add note, Full page); on phones only the icons show, the names stay for screen readers. The bar starts with "All books", back to the shelf.
- **Danger:** red text and red border; fills red on hover. Only "Delete all my data" and the per-book delete.
- **Icon-only:** carries an accessible name.
- A file input lives invisibly over a button-styled label so the whole button is the click target, with the accent focus ring.
- An empty drop zone in the library and an empty bookcase are click targets too: an invisible file input covers them (out of the tab order, since the button above does the same), and the drop zone's dashed border turns accent under the pointer.

### Doors

The hall's four links, arched like the doors of a cloister. Card background, 1px frame, everything centred: an icon in a rounded tile at the crown of the arch, the action as title, one or two lines of body, and a foot behind a hairline with the Latin plaque and a round arrow. The convert door also shows the formats in and out as tags, and the read door the book last opened. While the library is empty, its door shows a small stack of typographic covers, one classic from each free library.

### Room hero

The opening of every room: back link, Latin name, description and the checked list of what the room does, closed by a frame rule.

### Cards / Containers

- **Book card:** card, 1px frame, 12px radius. Cover on top, title and author, then Read (primary), Convert, delete. A book with no cover shows a wash-coloured catalogue card with a ruled inner frame and the title.
- **Ticket:** the Scriptorium's single container. Three legs headed From, To, Done, separated by dashed perforations.
- **Typographic cover:** a book cover set in type alone, for books Copista does not have: the title in Cinzel, a short rule, the author in small capitals. Four bindings take turns: accent, wash with a ruled frame, ink, and card with an accent spine. The title's size comes from its longest word, so it never breaks inside a word. No image is ever fetched.
- **Free libraries:** the end of the Bibliotheca. A heading, one line on what the libraries are, and a search box; each library row fans four classics that search for themselves at that site. Every link opens a new tab.
- **Bookcase:** the Lectorium's list of books when none is open. A card case with 1px frame and 14px radius; books stand by their spines on planks (a 2px frame-strong edge over a tinted board). Each spine is 30 to 45px wide and 150 to 195px tall, taken from a hash of the title, so a shelf looks the same every time; it wears one of the typographic covers' four bindings, gilt bands at head and foot, and the title in Cinzel set sideways, cut with an ellipsis (the full title and author are in the link). The book being read has a notched ribbon standing out of its head. An empty case shows one shelf of book shadows (a faint gold fill with two gilt bands at the head, one of them leaning into a gap until the example book lands there) above the line that sends to the library. A notice under the case says which books were just added.
- **First line:** a card (1px frame, 18px radius, a wash glowing from its top edge) under the hall's doors and under an empty bookcase. It holds the opening of a public-domain classic, one per day in the reader's time zone, headed by the part of the day ("A first line for this evening") in Cinzel accent. The text is set in an italic book serif (Iowan Old Style, Palatino, Georgia) with a Cinzel accent initial; verse keeps its line breaks. Below: title in Cinzel, author and translator muted, then "Read the rest, free" (primary, opens that edition's page in the catalogue in a new tab) and "Another first line". The lines are copied from the editions the catalogues give away.
- **The draw (Sortes):** beside the first line in the hall, in a card of the same frame, wash and radius; the two share a row on wide screens and stack on narrow ones. Headed "A book for October" in Cinzel accent. Two questions are set as the lines of a play: the speaker (Copista, You) in small Cinzel capitals in a narrow right-aligned column, the line in the book serif, the reader's answers in italic. The answers are outlined pills (frame-strong border, accent on hover); the times offered are only those the chosen mood can fill. Then three face-down cards (2:3, at most 128px): an accent back with a fine diagonal lattice, an inset ruled frame and a medallion with a Cinzel C. Turned, a card shows the book's typographic cover, its type scaled to the card's width. The result sets the cover beside the words: a stamp "Drawn" with the month on the card's lower corner (no blending, on the card colour), a headline in the book serif italic ("Bet you haven’t read this one."), the title in Cinzel, author, a one-line hook, words and reading time in tabular numerals with a word on the pace in ink italic, then "Get it free" (primary, opens the book's page at Standard Ebooks in a new tab) and "Draw again". One redraw a month; "Keep" and the title cancel it. After the redraw a muted italic line says when the next draw opens. On phones the result stacks, centred. The draw is kept in IndexedDB for its month only.
- **Note:** a slip of paper pinned to the page's top right corner: pale yellow (dark olive in the dark theme), a 3px accent top edge, a soft shadow, turned half a degree. A head with the first line (it folds the note) and a close button that deletes it; under it the text, which grows with what is written. Notes belong to a place in the book and show on the page that holds it; the reader's side panel lists them under Notes. An empty note is taken off when it loses focus.
- **Full page:** a tap in the middle of the page, the F key or "Full page" hides everything but the page, which fills the window. A pill at the bottom shows the page and "Exit full page"; Esc or another tap in the middle also leaves.
- **Guide (How it works):** at the end of the hall, reached from "See how it works", which scrolls to it and moves focus to its heading. A Cinzel heading and four flat cards in the order of the keys, each with its number large in the book serif and accent (oldstyle figures), what the room is for as title, two or three plain lines on how to use it, and an accent link into the room. A closing muted line says the numbers are keys, with the keys set as small framed `kbd` caps.
- **Ledger:** the Archivum's facts list. A double top rule, 1px rules between rows, labels in a fixed-width column.
- **Collation:** a ledger under the stamp in the ticket's Done leg, headed "Checked against the original". Once a copy is made, Copista reads it back and counts what arrived: words first, then only the parts the original has (headings, note links, pictures, tables, web links, italic and bold), each as "All 1,204" or "980 of 1,204". A row with losses is set in accent, with the reason under it in muted text when the format drops that part on purpose, and up to five missing words as examples. While the copy is being read, a muted "Reading the copy back…" holds the place. Plain text gets a closing line saying it holds words only.

### Navigation

The Hall tab (key 0), then four room tabs in the order of the keys 1 to 4, each named by what you do there. The tabs show in the hall too, so every room is one click from anywhere. A 2px accent stroke, the dash, sits under the open tab and slides to the next. On phones the bar moves to the bottom. Keys 0 to 4 work anywhere except while typing. The brand also returns to the hall.

### The Stamp

A 3px accent border with a 1px inner ruling, the uppercase word in Cinzel ("Copied", "Ready") over the date, rotated -6 degrees. It presses in once per finished job and uses multiply blending on light paper so it reads as ink. On a drawn card it sits on the card colour without blending, so it stays legible over a red cover.

## Do's and Don'ts

### Do:

- **Do** keep the accent for the open room, the primary action, the dash, the stamp and the first letter of names; in the dark, also for frames.
- **Do** keep Cinzel for names and the stamp only.
- **Do** keep every room name on one line at any width and zoom.
- **Do** keep every room one keystroke or one tap away, and keep the bottom bar on phones.
- **Do** give every motion a reduced-motion version with no movement.
- **Do** use tabular numerals for counts, sizes and dates.

### Don't:

- **Don't** set body text, buttons or labels in Cinzel.
- **Don't** add gradients or glass effects; the one gradient is the light on a door's edge.
- **Don't** use red for anything but errors and deleting.
- **Don't** make the dark accent orange or a saturated yellow; it is a warm gold that sits on black.
- **Don't** add ornament that does not mark state or name a room.
