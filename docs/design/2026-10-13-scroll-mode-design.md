# Copista: scroll mode and autoscroll

Status: approved 2026-10-13

## 1. Summary

The Lectorium gains a second way to read. Next to **Pages**, where one screen is turned at a time, **Scroll** shows each chapter as one long column that moves up under the finger. In Scroll mode the reader can start **autoscroll**: the text rises at a steady pace, set in words per minute, so a book can be read with no hands. An optional **guide line** marks a fixed height on the screen for the eye to follow.

## 2. Who uses it, and how

- **Hands-free reading.** A phone propped against a cup at breakfast, a tablet on a stand while cooking, a laptop while eating. The reader sets a pace once, presses play and only touches the screen to stop, to go back a line, or to change the pace.
- **Thumb scrolling.** Many people read web pages this way and prefer it to page turns. They never start autoscroll; the finger moves the text, with the momentum they know.
- **Paced reading.** Someone who wants to keep a steady rhythm, or to push it a little, uses the guide line and a pace a step above their usual one.

What this asks of the design:

- **A pace in words per minute, not in pixels.** A reader knows roughly how fast they read; nobody knows it in pixels. And a pixel speed would change the reading pace every time the text size, the screen width or the phone's orientation changes, so the reader would have to correct it each time. Copista converts the chosen pace into a scrolling speed for the chapter on screen (section 4).
- **Going back a line must not cost a restart.** A hand scroll while autoscroll runs moves the text where the reader puts it, and autoscroll carries on by itself after a short moment. Stopping is a deliberate tap.
- **Controls that can be reached while the text moves**, small enough not to cover it.
- **Lines of a readable length.** A column as wide as a desktop window is hard to follow, and harder when it moves. In Scroll mode the column is at most about 70 characters wide, centred.
- **Nothing else changes.** The place, bookmarks and notes stay valid when the reader switches mode, and Pages mode behaves exactly as it does today.

Non-goals
- A pace that learns from the reader or changes with the difficulty of the text.
- A teleprompter that mirrors or enlarges the text.
- One continuous column across chapters. Each chapter is still its own document; the next one follows when the current one ends.

## 3. What the reader sees

- **Mode.** The "Text" panel gets a group *Pages* / *Scroll*. The choice is saved with the text size and colours and applies to every book.
- **Scroll mode.** The chapter fills the reading area as one centred column. The finger, the wheel, the up and down arrows and the scrollbar scroll it. The side tap zones and the sideways swipe do not turn pages in this mode. Links work as they do now.
- **Chapter ends.** Below the last line of a chapter sits a "Next chapter" button ("End of the book" after the last one); above the first line of every chapter after the first sits a "Previous chapter" button. The Previous and Next buttons under the page, Page Up/Down and the left and right arrows scroll by one screen less two lines, and cross into the neighbouring chapter at either end, as page turns do now.
- **Autoscroll bar.** In Scroll mode a small bar floats at the bottom centre of the page: *slower*, the pace ("200 words/min"), *faster*, and *play/pause*. While the text moves the bar fades to half opacity, and comes back when touched, hovered or focused. It also shows in full page.
- **Tap.** In Scroll mode a tap on the text (not on a link) plays or pauses. Full page is reached with its button or F, as now.
- **Keys** in Scroll mode: Space plays or pauses, `+` and `-` change the pace.
- **Status line.** Under the page, Scroll mode shows the chapter and the percentage, without the page count.
- **Guide line.** A switch in the "Text" panel, shown in Scroll mode. When on, a faint horizontal band sits at one third of the page's height. It stays still and lets taps through. Saved like the other settings.

## 4. Pace

- **Levels.** Ten paces: 100, 125, 150, 175, 200, 225, 250, 300, 350 and 400 words per minute. Steps are finer at the slow end, where most people read moving text. Adults read silently at about 240 words per minute on average; following moving text is harder than reading still text, so the default is **200**. The last pace chosen is saved.
- **From words to pixels.** When a chapter is shown, the Scroller measures its height and counts its words (runs of non-space characters; for scripts written without spaces, every six characters count as one word, whichever count is larger). The speed is `pace / 60 * height / words` pixels per second. A larger text size, a narrower screen or a rotation changes the height per word, so the speed follows and the pace stays the same.
- **Limits.** A chapter that is mostly pictures would otherwise race past them, and one with a very dense table would crawl. The speed is kept between 0.1 and 3 lines per second (line height of the chapter's body text).
- **Smoothness.** The text is moved on each animation frame by the elapsed time times the speed, keeping a fractional position so slow paces do not stall on whole pixels. Starting and changing the pace ease in over half a second.

## 5. Autoscroll behaviour

- **Hand scroll while playing** (finger, wheel, arrows, scrollbar): autoscroll lets go, the text goes where the reader puts it, and autoscroll carries on 1.5 seconds after the last hand movement.
- **Pauses** (and waits for play) on: a tap on the text, the pause button or Space; opening the contents/bookmarks/notes panel or the "Text" panel; writing a note; the tab being hidden; leaving the Lectorium; switching to Pages mode; an error.
- **Chapter end.** When the last line reaches the bottom of the screen, autoscroll waits 1.5 seconds, opens the next chapter at its top and carries on. At the end of the book it stops.
- **Screen.** While playing, Copista asks the browser to keep the screen on (Screen Wake Lock API) and lets go on pause. Where the browser has no wake lock or refuses it, autoscroll runs anyway and the screen dims as usual.
- **Saving the place** while scrolling, at most once a second, and on every pause, as it is after a page turn now.

## 6. Architecture

### 6.1 One interface for two views

`src/reader/paginator.ts` keeps `Paginator`. A new `src/reader/scroller.ts` holds `Scroller`. Both implement:

```ts
interface ChapterView {
  readonly page: number;
  readonly pageCount: number;
  show(srcdoc: string, target: ShowTarget): Promise<void>;
  next(): boolean;
  prev(): boolean;
  fraction(): number;
  destroy(): void;
}
```

### 6.2 Scroller

- The chapter iframe keeps the same sandbox, CSP and transparent input layer, but is sized to the full height of the chapter so the frame itself never scrolls. The host element becomes the scrolling box, holding a column with the "Previous chapter" button, the frame and its input layer, and the "Next chapter" button. Because the layer scrolls together with the frame, a touch on it scrolls the host natively, with the platform's momentum, and links are found with `elementFromPoint` as now.
- Its layout style sets the body to one column at most 36em wide, centred, with the same side margins as Pages mode, and keeps pictures within the screen's height. After `settle(doc)` it measures the document height and sets the frame height; a `ResizeObserver` on the host and on the chapter body repeats this when the width or the text changes.
- `fraction()` is the share of the chapter above the top of the screen, which is what a page's fraction means now (`page / pageCount`). Opening at a fraction scrolls to `fraction * chapterHeight`, so a place saved in one mode opens at the same text in the other. A fragment scrolls its target to the top.
- Like the Paginator it keeps an anchor fraction that only a move changes, so a resize comes back to the same text.
- `page` and `pageCount` are counted in screens, so the notes pinned to "this page" keep working.
- `next()` and `prev()` scroll by one screen less two lines and return false at the bottom and top.
- `advance(px)` moves down by a fraction of a pixel's worth and returns false at the bottom; `speedFor(pace)` returns pixels per second for the chapter shown (section 4).
- Events: `onInternalLink`, `onHandScroll()` for scrolls the Scroller did not make itself, and `onEdge('prev' | 'next')` for the chapter buttons.

A throwaway test (2026-10-13) confirmed on Chromium and WebKit that a sandboxed frame 378,000 px tall, inside a scrolling host and under an input layer, scrolls with the wheel, keeps links clickable deep in the chapter, and moves smoothly under `requestAnimationFrame`. Touch scrolling on real phones is checked by hand (section 8).

### 6.3 Autoscroll

`src/reader/autoscroll.ts`:
- Pure functions, unit tested: the pace levels, `pixelsPerSecond(pace, height, words, lineHeight)` with its limits, and the word count of a text.
- `Autoscroll` class: owns the animation frame loop, the ease-in, the hand-scroll hold and its 1.5 s resume, the wake lock and the hidden-tab pause. It moves the text through callbacks (`advance(px)`, `speed()`), and calls `onEnd()` at the bottom of a chapter, which the controller answers by opening the next chapter (or stopping at the end of the book). It reports `playing` changes so the interface can update.

### 6.4 Controller and settings

- `ReadingController` holds a `ChapterView`. `setMode(mode)` destroys the current view, builds the other kind and reopens the chapter at the current fraction, as `setLook` does now for a change of text size. In Scroll mode it saves the place after hand scrolls (at most once a second) and owns the `Autoscroll`, exposing `play()`, `pause()`, `playing` and `setPace(pace)`.
- `Settings` gains `mode: 'pages' | 'scroll'` (default `'pages'`), `pace: number` (one of the levels, default 200) and `guideLine: boolean` (default false), merged and validated like the existing fields, so old saved settings load unchanged.
- The Lectorium chooses the tap behaviour, the keys, the status line and the autoscroll bar by mode, and calls `pause()` when a panel opens or a note gets focus.

## 7. Errors and limits

- If a chapter fails to load, the error shows as now and autoscroll pauses.
- Very long chapters make a very tall frame. The throwaway test found no problem on desktop engines at 378,000 px; if a phone shows blank stretches, the fallback is to cap the frame height and split the chapter, decided after the phone test.
- Find-in-page and focus moves scroll the host; the Scroller treats them as hand scrolls.

## 8. Testing

Unit (Vitest)
- Settings: new fields default, snap to the levels and reject bad values; old saved settings load.
- Pace: levels, pixels per second, its limits, word counts with and without spaces.

End to end (Playwright, Chromium and WebKit, desktop and 360 px phone width)
- Switching Pages to Scroll and back keeps the place.
- Scrolling by hand saves the place; reopening the book returns there.
- Autoscroll moves the text; a tap, Space and opening a panel pause it; play resumes it; a hand scroll holds it and it carries on.
- Autoscroll reaches the end of a short chapter and continues into the next one.
- The pace buttons change and remember the pace; a larger text size keeps the same words per minute (the pixel speed grows).
- The chapter buttons cross chapters; links inside the chapter work in Scroll mode.
- The guide line shows only in Scroll mode with its switch on.
- Pages mode tests stay green unchanged. No horizontal overflow at 360 px.

By hand
- Giuseppe on his phone: finger scrolling with momentum, autoscroll at a few paces, the screen stays on, rotation keeps the place, a long chapter shows no blank stretches.
