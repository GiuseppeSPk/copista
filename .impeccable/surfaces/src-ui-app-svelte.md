---
version: 1
slug: "src-ui-app-svelte"
primary_target: "src/ui/App.svelte"
related_targets: ["src/ui/Scriptorium.svelte","src/ui/Bibliotheca.svelte","src/ui/Lectorium.svelte","src/ui/Archivum.svelte","src/ui/styles.css"]
---

## Direction contract: app shell and the four rooms

MODE: Operate. Navigation and controls stay standard web components; the world lends palette, density and one signature move.

THESIS: Copista is a card catalogue with a date stamp. Every room is a drawer you reach in one keystroke or one tap, and every finished job gets the Copista stamp.

OWN-WORLD: The library card catalogue and the loan stamp (base, the assigned roll), plus two borrowed moves chosen by the user on 2026-10-09: the dash stroke from "Rubrica" (a single colour stroke carries you between rooms) and the FROM / TO / DONE ticket from "Carta d'imbarco" (the Scriptorium reads as one line, left to right). The user asked for an uncluttered look that is easy to move around in: nothing ornamental that does not mark state.

STORY: Pick a drawer, do the job, see the stamp. The stamp is the recognisable mark: a violet, slightly tilted, double-ruled rectangle. It appears in the brand mark, the app icon, and on every finished conversion.

FIRST VIEWPORT: The hall: "Copista" in Cinzel, one line on what the app does, and four doors named by action (Convert a file, Read a book, Keep your books, Manage your data), each with its Latin plaque. A slim top bar with the stamp mark, the four rooms as action tabs (also keys 1 to 4), the GitHub star link and the theme switch. On phones the tabs move to a bottom bar with one short word each. Every room opens with its Latin name large, what it is and what can be done there.

FORM:
- Seed d3d56ce0 (concept-seed, operate, assigned "Scheda e timbro", user blend with model-pick and challenger-boarding).
- Palette closed (redesign 2026-10-10): light paper #f6f4ef, card #ffffff, ink #1c1a21, accent violet #4f2a9a; dark paper #110f0d, card #1b1815, ink #f1ece6, accent gold #f2c14e with near-black #1a1406 on it. The accent is reserved for the open room, the primary action, the dash, the stamp and the first letter of names; in the dark it also draws the frames of doors and cards. Red #c8322b / #ff7a70 for errors and deleting only.
- Type: Cinzel (bundled, OFL) for the brand, room names, door plaques and the stamp word; the platform UI sans for everything else. Room names sit on one line at any zoom, sized against the room hero with container query units. Tabular numerals for counts and sizes.
- Grid: 8 px.
- Motion: one exponential ease-out. The hall name is inscribed and the doors rise in; a door plaque grows into the room name (view transition) and shrinks back; rooms slide in from the side of the picked tab while the dash slides under it; pressed controls send a ring out; the theme changes in a growing circle; the stamp presses in once per finished job. Nothing travels under reduced motion.
- Room interiors: Bibliotheca is a shelf of uniform book cards; Lectorium hides its chrome behind the page; Scriptorium is the ticket; Archivum is a ruled ledger.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
