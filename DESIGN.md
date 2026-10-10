---
name: Copista
description: A building of four rooms with Latin names, for reading and converting books in the browser.
colors:
  paper: '#f6f4ef'
  card: '#ffffff'
  ink: '#1c1a21'
  muted: '#5d5a66'
  line: '#e2dfe7'
  line-strong: '#c4bfcf'
  control: '#8a8696'
  accent: '#4f2a9a'
  accent-ink: '#ffffff'
  wash: '#efeaf9'
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

- One accent per theme: violet on light paper, lamp gold in the dark. It marks state and the action that matters.
- Cinzel, cut from Roman inscriptions, for names only: the brand, room names, plaques, the stamp's word. Everything else is the platform sans.
- In the dark the accent also draws the frames of cards and doors, so the boxes read as lit edges on black.
- Motion is visible but short: the name of a room travels between door and page, pressed controls send a ring out, the theme changes in a widening circle.
- Phones get the rooms in a bottom bar within thumb reach.

## Colors

A closed palette: paper, card and ink neutrals, one accent, one red. Both themes keep the same roles. The theme follows the system until the switch in the top bar is used; the choice is kept on the device.

### Accent

- **Accent** (accent; dark: accent-dark): the first letter of the brand and of every room name, the brand mark, the open tab and the dash under it, the primary button, the stamp, focus rings, selection and the text caret. Light: violet `#4f2a9a`. Dark: gold `#f2c14e`, warm and strong but not saturated, chosen to sit on near-black.
- **Accent Ink** (accent-ink; dark: accent-ink-dark): text on an accent fill. White on violet; near-black `#1a1406` on gold.
- **Wash** (wash; dark: wash-dark): the quiet tint behind a chosen file and behind a book with no cover.

### Frames

- **Frame**, **Frame Strong**, **Frame Hover**: the borders of doors, cards, the ticket and tags. On paper they are quiet rules from the line greys. In the dark they are the gold at 34% and 52% over the card, and full gold on hover.

### Tertiary

- **Red** (red; dark: red-dark): error messages and the destructive action only.

### Neutral

- **Paper**: the page ground and the top bar. Warm off-white; in the dark a warm near-black, not blue-grey, so the gold reads as lamplight.
- **Card**: doors, book cards, the ticket, controls.
- **Ink**: text, and the border of a hovered control.
- **Muted**: hints, authors, the lists of what a room can do.
- **Line** and **Line Strong**: rules between parts, the ledger's double top rule.
- **Control**: the resting border of buttons, selects and text fields, kept at 3:1 against the card.

**The Accent Rule.** The accent means "this is where you are", "do this" or "this is done", plus the first letter of a name. If an element is none of these, it is not violet or gold. In the dark, frames are the one extra use.

**The Red Ink Rule.** Red appears only for errors and for deleting. It never decorates.

## Typography

**Display Font:** Cinzel (variable), bundled with the app from `@fontsource-variable/cinzel` under the SIL Open Font License; no font is loaded from the network.
**Interface Font:** the platform UI sans (system-ui with platform fallbacks).

### Hierarchy

- **Room name** (Cinzel 600, letter-spacing 0.04em): one per room, on one line. Its size is `min(104px, 100cqi / 7.3)` against the room's opening, so the longest name, Scriptorium (7.13em wide), always fits and every room shares that size. It never wraps or clips, at any zoom.
- **Home name** (Cinzel 600, `clamp(56px, 9vw, 96px)`): "Copista" in the hall.
- **Brand** (Cinzel 650, 19px, letter-spacing 0.06em): the name beside the mark in the top bar.
- **Plaque** (Cinzel 600, 15px): the Latin name on each door.
- **Title** (16px, 700): section headings inside a room and the From / To / Done legs of the ticket. Door titles are 22px, the convert door 26 to 32px.
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
- The hall's doors are a grid: the convert door is tall on the left; read spans the top right; library and data share the bottom right.
- A room opens with its hero: a "All rooms" link back, the Latin name, then the description and a short checked list of what can be done there, side by side. They stack at 860px and below.
- Tabs lose their icons at 1000px and below and switch to one short word each (Books, Read, Convert, Data) at 860px and below, which also covers zoomed-in desktop windows.
- At 700px and below the tabs leave the top bar and become a fixed bottom bar with an icon over the short word; the room column gets matching bottom padding.
- The shelf is an auto-fill grid with 168px minimum columns. At 560px and below each book becomes a list row.
- The ticket is three columns (From, To, Done) and stacks at 860px and below.
- The Lectorium's contents panel is a 240px column on wide screens and an overlay on phones.
- No page scrolls sideways at any width or zoom, and no word is split across lines.

**The One Line Rule.** The Scriptorium reads left to right as one journey: what you have, what you want, what you got. Do not add a fourth leg or a side panel.

## Elevation & Depth

Mostly flat. Depth comes from the paper / card contrast and 1px frames. Doors lift 3px on hover with one soft shadow, and their border catches the light where the pointer is (a radial accent gradient masked to the 1px edge). Nothing else gets a drop shadow.

**The Flat Drawer Rule.** No drop shadows on cards, the ticket or menus. If something must stand out, give it a stronger frame or the wash.

## Shapes

Rounded rectangles: 4px for miniature covers, 6px for the stamp and tags, 8px for controls, 12px for book cards, 14px for the ticket, 18px for doors. Round buttons (the star, the theme switch, a door's arrow) are pills. The ticket's leg separators are 1px dashed rules with half-circle notches at each end, like a perforation. The stamp is rotated -6 degrees.

## Motion

All motion uses one exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`). Entrances run around 600 to 1100ms, exits about 250ms.

- **Hall entrance:** the name is inscribed (letter-spacing closes, blur clears, about 1s), the lead and the doors rise in one after another.
- **Into a room:** the plaque on the door grows into the room's name (a view transition); the rest of the page fades down and the room rises in. Back to the hall, the name shrinks into its plaque.
- **Between rooms:** the new room slides in from the side of the tab that was picked; the dash under the tabs slides to the open one.
- **Room opening:** the description and the list of what can be done rise in after the name.
- **Press:** a pressed button, tab or door sends a faint ring out from the point of the press and dips to 97%.
- **Theme switch:** the new theme is revealed in a circle growing from the switch.
- **The stamp** presses in once per finished job (240ms).

Under reduced motion everything still changes, but nothing travels: no transitions, no rings, no press.

## Components

### Buttons

- **Default:** card background, ink text, 1px control-coloured border, 36px minimum height, 8px radius. Hover darkens the border to ink.
- **Primary:** accent fill with accent-ink text. One per screen region: "Add EPUB books", "Choose a file", "Read" on a book card.
- **Danger:** red text and red border; fills red on hover. Only "Delete all my data" and the per-book delete.
- **Icon-only:** carries an accessible name.
- A file input lives invisibly over a button-styled label so the whole button is the click target, with the accent focus ring.

### Doors

The hall's four links. Card background, 1px frame, 18px radius, an icon in a rounded tile, the action as title, one or two lines of body, and a foot with the Latin plaque and a round arrow. The convert door also shows the formats in and out as tags, and the read door the book last opened.

### Room hero

The opening of every room: back link, Latin name, description and the checked list of what the room does, closed by a frame rule.

### Cards / Containers

- **Book card:** card, 1px frame, 12px radius. Cover on top, title and author, then Read (primary), Convert, delete. A book with no cover shows a wash-coloured catalogue card with a ruled inner frame and the title.
- **Ticket:** the Scriptorium's single container. Three legs headed From, To, Done, separated by dashed perforations.
- **Ledger:** the Archivum's facts list. A double top rule, 1px rules between rows, labels in a fixed-width column.

### Navigation

Four tabs, in the order of the keys 1 to 4, each named by what you do there. A 2px accent stroke, the dash, sits under the open tab and slides to the next. On phones the bar moves to the bottom. Keys 1 to 4 work anywhere except while typing. The brand returns to the hall.

### The Stamp

A 3px accent border with a 1px inner ruling, the uppercase word in Cinzel ("Copied", "Ready") over the date, rotated -6 degrees. It presses in once per finished job and uses multiply blending on light paper so it reads as ink.

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
