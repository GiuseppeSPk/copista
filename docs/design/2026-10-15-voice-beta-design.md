# Read aloud, in beta: the voice inside the Lectorium

This design follows on from `2026-10-13-voices-design.md`, which stays in force where this one
does not change it. The engine, the download, the licence and the settings Giuseppe chose by
ear on 2026-10-13 and 2026-10-14 are not reopened here: 16 steps where the device keeps up,
speed 1.1, seeds M2 = 2 and F1 = 1, commas left alone, fp16 weights.

## 1. Goal

Reading aloud is Copista's showpiece, offered as a beta. It should feel like part of the
reader, not a separate place, and come closer to the warmth and pace of an audiobook.

Giuseppe's words, 2026-10-15:

- remove the large arch on the home page that leads to the Auditorium; "we must not crowd it";
- the app itself stays as it is; the work is on the voice;
- the voices read correctly but lack warmth and the rhythm of an audiobook. A human narrator
  is out of reach, but we can come closer;
- present reading aloud as a beta, and as the app's flagship.

Success means:

- the home page has four doors again, and nothing on it is louder than before;
- the voice is set up, chosen and heard from inside the Lectorium, without leaving the book;
- while it reads, the sentence being read is marked and the page follows it;
- Giuseppe prefers the new pacing to the current one in a blind A/B test.

## 2. Scope

In:

1. Remove the Auditorium room; move its contents into the Lectorium.
2. The beta label.
3. Following the reading: highlight, page turning, next chapter, the Listen bar, the lock
   screen.
4. Warmth and pace, each change decided by blind listening.

Out: new voices or engines, other languages, exporting audio, any change to the home page
other than removing the door and adding one line.

## 3. Removing the Auditorium

**Removed:**

- the fifth door on the home page (`door-listen` in `Home.svelte`);
- the `auditorium` entry in `ROOMS` (`src/ui/rooms.ts`), its route (`route.ts`), its render
  and the key 5 in `App.svelte`. The keyboard shortcuts go back to 1–4;
- `src/ui/Auditorium.svelte`.

**Kept and renamed:** `src/rooms/auditorium/` becomes `src/rooms/voice/`. It holds the same
operations (status, install, remove), since they belong to the voice, not to a room.

**Redirected:** an old `#/auditorium` link opens the Lectorium (the last book, or the
Lectorium's empty state).

**Text:** `Archivum.svelte` now says the voice is set up from the Lectorium.

**On the home page:** inside the Lectorium door, one quiet line under the existing body text:
"Can read aloud · Beta". It uses the door's small text style and adds no icon, so the door
keeps its size.

## 4. The voice in the Lectorium

**The Listen tool is always in the toolbar**, between Autoscroll and Look. Today it appears
only once the voice is installed. The toolbar still has seven tools and must fit at 320 px.

- When the voice is not set up, pressing Listen opens the **voice sheet**.
- When it is set up, pressing Listen starts reading and shows the **Listen bar** (section 6).

**The voice sheet** is a panel in the same style as the Look panel, opened from the Listen tool
or from the voice button on the Listen bar. It is titled "The Lector" with a small "Beta" mark
beside it. Its contents are the Auditorium's, in the same order and with the same words where
they still fit:

- one sentence of introduction;
- the two samples, the Lector and the Lectrix reading the same lines;
- not set up yet:
  - "Works best on recent phones and computers.";
  - the download size, the host, and that it then reads offline;
  - the licence text and links;
  - the accept checkbox;
  - Download, then progress and Cancel;
- set up:
  - who reads (Lector or Lectrix);
  - space used;
  - Remove the voice.

**The download outlives the sheet.** Its state lives in a small module
(`src/ui/voice.svelte.ts`), not in the component. Closing the sheet, or turning pages, does not
stop it, and opening the sheet again shows its progress. Leaving the Lectorium cancels it,
as leaving the Auditorium does today. The download resumes where it stopped next time.

When the download finishes, the sheet says "The voice is ready." and offers a single button,
"Listen from here", which closes the sheet and starts reading.

## 5. Beta

"Beta" appears in exactly three places, so it reads as a label and not as a warning:

- in the voice sheet's title;
- on the Listen bar, beside the reader's name;
- in the home page line "Can read aloud · Beta".

The mark is small caps in the accent colour, with no box or pill. The sheet adds one line under
the introduction: "The voice is new. It may stumble over a name or a number; it gets better with
each version."

## 6. Following the reading

As planned in section 6 of the 13 October design, with these choices:

- **Highlight.** The piece being read is marked with the CSS Custom Highlight API in the chapter
  document: a soft background in the accent colour at low opacity, in the light, sepia and dark
  looks. Where the API is missing, nothing is marked and reading works the same.
- **Follow.**
  - In page mode, when the next piece starts on a later page, the view turns to that page.
  - In scroll mode, the view scrolls so that the piece sits in the upper third of the screen,
    smoothly unless the reader prefers reduced motion.
- **Turning by hand.** Turning the page, jumping from the contents, or scrolling by hand (once
  the scroll settles) restarts the reading at the first block on screen. A scroll caused by the
  reading itself does not count.
- **Next chapter.** At the end of a chapter, the reader opens the next one and keeps reading,
  after a pause (section 7). At the end of the book it stops.
- **Autoscroll.** Listening and autoscroll exclude each other: starting one stops the other.
- **Ahead.** The current code makes one piece ahead. It becomes a queue of up to about two
  minutes of audio, played audio dropped. When playback catches up with generation, the bar
  shows "The Lector is catching up…" and playback waits.

**The Listen bar** sits at the bottom of the reader, above the page, while listening. It is one
line, at most 56 px high, and it fits 320 px:

- previous piece, play/pause, next piece;
- the reader's name ("The Lector" or "The Lectrix") with "Beta"; pressing it opens the voice
  sheet to switch reader;
- close (stops reading and hides the bar).

The IT/EN switch planned on 13 October is left out: the book's language is used, as now.

**The lock screen.** The Media Session API shows the book's title and author, with play, pause,
previous and next.

## 7. Warmth and pace

Nothing in this section ships on my judgement. Every change is heard first, blind, against the
current reading.

**The voice lab.** A page served only in development (`/voice-lab.html`, left out of the
build). It runs the real model on a fixed set of Italian and English passages: Collodi, Manzoni,
a dialogue, a passage with headings, numbers and abbreviations, and an English passage. For a
pair of settings it plays A and B in a random order, records which one Giuseppe prefers, and
shows the answers only at the end. It replaces the spike page that is no longer in the repo.

**The levers**, in the order I would test them:

1. **Pauses by structure.** Today every piece ends with 0.3 s of silence, whatever comes next.
   An audiobook pauses longer between paragraphs, and longer still after a heading or at the end
   of a chapter. The silence is moved out of the worker and into the reading, which knows what
   comes next. The starting values are 0.3 s between pieces of the same paragraph, 0.6 s between
   paragraphs, 0.9 s after a heading, and 1.5 s between chapters. Giuseppe's ear settles the
   final values.
2. **A short fade at the end of each piece** (15 ms), against clicks where the audio stops.
3. **Text fixes from the audit**, each tested on its own:
   - Italian abbreviations (sig., dott., ecc.), guarded so they do not match inside words;
   - Roman numerals after Capitolo, Canto, Libro, Tomo, Atto and Scena;
   - the frame noise variant, against the current noise.
4. **A gentle tone shaping**, applied to each piece before playing: a small lift in the low
   mids and a light compression, to make the voice less thin. It runs in the page and costs
   little.
5. **Seeds.** Two or three other seeds per voice, picked for warmth, against the current ones.
6. **Speed** stays at 1.1 unless a new blind test on whole paragraphs prefers another.

A lever that loses, or ties, is dropped. Once the levers are settled, the two samples are
recorded again with the final settings.

**What Giuseppe's ear decided** (one blind round of the eleven trials, seed 3416134635,
2026-10-15):

- Kept: the 15 ms fade, the warmer tone, Roman numerals read as ordinals, and seed 3 for the
  Lectrix (against 1).
- Dropped: pauses by structure (0.3 s after every piece was preferred), the Italian
  abbreviations (a tie), the frame noise (the noise over the whole latent was preferred), and the
  other seeds for the Lector (5 and 7 tied with 2) and for the Lectrix (4 tied with 1).
- Speed stays at 1.1, preferred over 1.0.
- Each lever was heard once, on one passage, so a later round can still overturn any of them.
  The lab keeps playing the trials against the voice as it read before this round, so its labels
  stay true now that the defaults have moved.
- The two samples were recorded again through the app's own voice code, with these settings,
  at 16 steps.
- After the Android trial of 16 October the samples were recorded once more, the silence
  trimmed, both voices on the same few lines of plain present-day Italian written for Copista
  instead of Collodi and Manzoni, whose old words suit the lab better than a first hearing.
  The lines, a memory of a grandmother's kitchen, were chosen by ear from seven candidates.

## 8. Units

| Unit | Change |
| --- | --- |
| `src/voice/listen.ts` | A queue of up to about two minutes ahead; pauses by structure; previous and next; catching up; reports the piece being read |
| `src/voice/text.ts` | Each piece records what follows it: same paragraph, new paragraph, after a heading, end of chapter |
| `src/voice/supertonic.ts`, `worker.ts` | The trailing silence leaves the worker; text fixes that win the blind test |
| `src/voice/audio.ts` | The fade, and the tone shaping if it wins |
| `src/voice/session.ts` (new) | The Media Session |
| `src/reader/paginator.ts`, `scroller.ts` | Highlight a range; bring a range into view; tell a turn by the reader from a turn by the reading |
| `src/rooms/lectorium/controller.ts` | Continue into the next chapter for the reading |
| `src/rooms/voice/` | The former `src/rooms/auditorium/` |
| `src/ui/voice.svelte.ts` (new) | Voice status and download state, outliving the sheet |
| `src/ui/VoiceSheet.svelte` (new) | The voice sheet |
| `src/ui/ListenBar.svelte` (new) | The Listen bar |
| `src/ui/Lectorium.svelte` | The Listen tool always shown; the sheet and the bar |
| `src/ui/Home.svelte`, `rooms.ts`, `route.ts`, `App.svelte`, `Archivum.svelte` | Auditorium removed, line added, old link redirected |
| `voice-lab.html`, `src/voice/lab/` (development only) | The blind test page |

`Lectorium.svelte` is already over 900 lines, so the sheet and the bar are separate components.

## 9. Order

1. Remove the Auditorium and bring the voice sheet into the Lectorium (sections 3 to 5).
2. Following: highlight, page turning, next chapter, the bar, the lock screen (section 6).
3. The voice lab, then the blind tests one lever at a time (section 7), then the new samples.

Each step ends with the checks green and a commit on `voices`. Steps 1 and 2 do not wait for
the listening tests.

## 10. Choices I made (override any)

- The voice sheet in the Lectorium, opened from the Listen tool, rather than a section of the
  Look panel or a page of its own.
- The Listen tool always visible, so the feature can be found without the Auditorium.
- `#/auditorium` redirected rather than left broken.
- "Beta" in three places only, as small caps text.
- The IT/EN switch left out.
- The starting pause values in section 7.
- Tone shaping applied as each piece plays, not baked into the model output.

## 11. Testing

- **Unit:**
  - what follows each piece, on chapters with headings, lists and notes;
  - the queue: its two-minute bound, pauses, previous and next, catching up, stopping, with the
    fake narrator and a fake clock;
  - the fade and the tone shaping on known signals (length kept, no clipping);
  - the old route redirected.
- **e2e, with the fake voice:**
  - the home page has four doors and the "Beta" line;
  - Listen without the voice opens the sheet; accept, download, "Listen from here";
  - the download carries on with the sheet closed;
  - while reading, the piece is highlighted and the page turns to follow it;
  - turning by hand restarts at the new page;
  - reading continues into the next chapter;
  - autoscroll and listening exclude each other;
  - the bar and the sheet fit at 320 px, in the three looks;
  - remove the voice from the sheet.
- **Limits:** Playwright's WebKit on Windows plays no audio, so playback tests are skipped there
  with that reason; the WebKit tests of the tool, sheet and bar still run. The iPhone unlock
  and the lock screen controls are checked by Giuseppe on a real phone.
