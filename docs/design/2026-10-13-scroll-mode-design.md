# Copista: scroll mode and autoscroll

Status: draft for review, 2026-10-13

## 1. Summary

The Lectorium gains a second way to read. Next to **Pages**, where one screen is turned at a time, **Scroll** shows each chapter as one long column that moves up under the finger. In Scroll mode the reader can start **autoscroll**: the text rises at a steady, adjustable speed, so a book can be read with no hands. An optional **guide line** marks a fixed height on the screen for the eye to follow.

## 2. Goals and non-goals

Goals
- Hands-free reading on a phone propped up or a laptop, at a speed the reader can tune while reading.
- Natural scrolling with the finger (momentum included, on iPhone too) and with the mouse wheel.
- The place in the book, bookmarks and notes stay valid when the reader switches mode.
- Pages mode behaves exactly as it does today.

Non-goals
- Speed measured in words per minute, or speed that adapts to the text.
- A teleprompter that mirrors or enlarges the text.
- Scrolling across chapter boundaries as one continuous column. Each chapter is still its own document; the next one follows when the current one ends.

## 3. What the reader sees

- **Mode.** The "Aa" panel gets a third group, *Pages* / *Scroll*. The choice is saved with the text size and colours and applies to every book.
- **Scroll mode.** The chapter fills the reading area as one column. The finger, the wheel, the arrow keys and Page Up/Down scroll it. The side tap zones and the swipe do not turn pages in this mode; a tap on a link still follows it.
- **Chapter ends.** Below the last line of a chapter sits a "Next chapter" button; above the first line of every chapter after the first sits a "Previous chapter" button. Arrow keys and the existing previous and next buttons scroll by one screen less one line, and cross into the neighbouring chapter at either end, as page turns do now.
- **Autoscroll controls.** In Scroll mode the toolbar shows a play/pause button and, while playing, slower and faster buttons with the level shown between them (1 to 10). The last level is saved.
- **Tap.** In Scroll mode a tap on the text (not on a link) plays or pauses. When autoscroll has never been started in this reading, a tap fits the page to the window, as it does in Pages mode now.
- **Guide line.** A switch in the "Aa" panel, shown only in Scroll mode. When on, a faint horizontal band sits at one third of the reading area's height. It does not move and does not catch taps. Saved like the other settings.

## 4. Autoscroll behaviour

- **Speed.** Level *n* moves the text by `12 * 1.3^(n-1)` CSS pixels per second, from 12 px/s at level 1 to about 127 px/s at level 10. The default level is 4 (about 26 px/s, close to a slow reading pace at the default text size). The rise is driven by `requestAnimationFrame`, uses elapsed time so a slow device keeps the same speed, and keeps a fractional position so slow speeds do not stall on whole pixels.
- **Pauses by itself** when: the reader scrolls by hand (wheel, touch, keys, scrollbar), the "Aa" panel or the contents/marks/notes panel opens, a note is being written, the tab is hidden, or the reader leaves the Lectorium. Panels and hidden tabs do not resume it on close; the reader presses play again.
- **Chapter end.** When the bottom of the chapter reaches the bottom of the screen, autoscroll waits 1.5 seconds, opens the next chapter at its top and carries on. At the end of the book it stops.
- **Screen.** While playing, Copista asks the browser for a screen wake lock so the phone does not dim. It releases the lock on pause. Where the browser has no wake lock, or refuses it, autoscroll runs anyway and the screen may dim as usual.
- **Saving the place.** The position is saved while scrolling, at most once a second, and on every pause, as it is after a page turn now.

## 5. Architecture

### 5.1 Scroller

A new class, `src/reader/scroller.ts`, beside `Paginator`. Both implement one interface that the controller uses:

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

The Scroller differs from the Paginator in where the scrolling happens:

- The chapter iframe keeps the same sandbox, CSP and input layer, but is sized to the full height of the chapter, so the frame itself never scrolls. The host element becomes the scrolling box (`overflow-y: auto`), with a sizer inside it that holds the frame and the input layer. Because the layer scrolls together with the frame, a touch on it scrolls the host natively, with the platform's momentum, and links are still found with `elementFromPoint`.
- Its layout style sets the chapter to one column the width of the host, with the same side margins as Pages mode, and limits pictures to the screen height so a tall one never needs two screens. After `settle(doc)` it measures the document height and sets the frame height; a `ResizeObserver` on the host and on the chapter body repeats this when the width or the text changes.
- `fraction()` is `scrollTop / chapterHeight`: the share of the chapter above the top of the screen, which is the same meaning a page's fraction has now (`page / pageCount`). Opening at a fraction sets `scrollTop` to `fraction * chapterHeight`, so a place saved in one mode opens at the same text in the other. Fragments scroll the target to the top.
- Like the Paginator, it keeps an anchor fraction that only a move changes, so a resize comes back to the same text.
- `page` and `pageCount` are counted in screens (`floor(scrollTop / screenHeight)` and `ceil(chapterHeight / screenHeight)`), so the existing "page x of y" display keeps working; in Scroll mode the toolbar shows only the percentage.
- `next()` and `prev()` scroll by one screen less one line and return false at the bottom and top.
- An event `onScroll()` reports scrolls the reader made by hand, so the controller can save the place and the autoscroller can pause.

The prototype in a throwaway test (2026-10-13) confirmed on Chromium and WebKit that a sandboxed frame 378,000 px tall, inside a scrolling host and under an input layer, scrolls with the wheel, keeps links clickable deep in the chapter, and moves smoothly under `requestAnimationFrame`. Touch scrolling on a real iPhone and Android phone is checked by hand (section 7).

### 5.2 Autoscroller

`src/reader/autoscroll.ts`, a small class that owns the animation frame loop, the speed level, the wake lock and the pause rules that come from inside the reading area (hand scroll, hidden tab). It moves the Scroller through one method, `advance(px): 'moved' | 'end'`, and asks the controller to cross the chapter when it gets `'end'`. Pauses that come from the interface (panels, notes, leaving) are calls from the Lectorium.

The speed formula and the level bounds live in a pure function with unit tests.

### 5.3 Controller and settings

- `ReadingController` holds a `ChapterView` instead of a `Paginator`. Changing the mode destroys the current view, builds the other kind, and reopens the chapter at the current fraction, as `setLook` does now for a change of text size.
- `Settings` gains `mode: 'pages' | 'scroll'` (default `'pages'`), `scrollSpeed: number` (1 to 10, default 4) and `guideLine: boolean` (default false), merged and validated like the existing fields, so old saved settings load unchanged.
- The Lectorium chooses the tap behaviour and the toolbar by mode, and calls `pause()` when it opens a panel or the note editor.

## 6. Errors and limits

- If a chapter fails to load, the error appears as it does now and autoscroll pauses.
- Very long chapters make a very tall frame. The prototype found no problem on desktop engines at 378,000 px; if a phone shows blank stretches, the fallback is to cap the frame height and split the chapter, decided after the phone test.
- Find-in-page and focus moves scroll the host; the Scroller treats them as hand scrolls.

## 7. Testing

Unit (Vitest)
- Settings: new fields default, clamp and reject bad values; old saved settings load.
- Speed function: level bounds and values.

End to end (Playwright, Chromium and WebKit, desktop and 360 px phone width)
- Switching Pages to Scroll and back keeps the place (the same paragraph is on screen).
- Scrolling by hand saves the place; reopening the book returns there.
- Autoscroll moves the text, pauses on a tap, on a hand scroll and on opening a panel, and resumes on play.
- Autoscroll reaches the end of a short chapter and continues into the next one.
- Speed buttons change and remember the level; the guide line shows only in Scroll mode.
- Links inside the chapter work in Scroll mode; Pages mode tests stay green unchanged.
- No horizontal overflow at 360 px.

By hand
- Giuseppe on his phone: finger scrolling with momentum, autoscroll at a few speeds, screen stays on, rotation keeps the place, a long chapter shows no blank stretches.
