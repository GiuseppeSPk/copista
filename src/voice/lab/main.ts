/*
 * The voice lab, for development only: no link leads here and the build
 * leaves it out. Each trial reads a whole passage twice, with two settings
 * of the voice in an order the listener does not know, and asks which was
 * better. The settings are named only at the end.
 */
import { encodeWav, finishPiece } from '../audio';
import { WorkerNarrator, voiceWorker } from '../narrator';
import { describeLoad, describePiece } from '../stopwatch';
import { isInstalled } from '../store';
import { piecesOf } from '../text';
import { TRIALS, shuffle, tally, type Answer, type Trial, type Variant } from './blind';
import { PASSAGES, passageDocument } from './passages';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const status = $<HTMLParagraphElement>('status');
const begin = $<HTMLButtonElement>('begin');
const trialView = $<HTMLElement>('trial');
const heading = $<HTMLHeadingElement>('trial-heading');
const passageTitle = $<HTMLParagraphElement>('trial-passage');
const players = [$<HTMLAudioElement>('first'), $<HTMLAudioElement>('second')] as const;
const choices = $<HTMLElement>('choices');
const results = $<HTMLElement>('results');
const stopwatch = $<HTMLParagraphElement>('stopwatch');

const narrator = new WorkerNarrator(voiceWorker);

/** The pieces made so far, for the stopwatch: their times added up, and how long they last. */
const soFar = {
  pieces: 0,
  seconds: 0,
  durationPredictor: 0,
  textEncoder: 0,
  vectorEstimator: 0,
  vocoder: 0,
};

/** Shows how long loading took and, over the pieces soFar so far, each model on average. */
function showTimes(samples?: Float32Array): void {
  const lines = narrator.loadTimes ? [describeLoad(narrator.loadTimes)] : [];
  const last = narrator.lastTimes;
  if (samples && last) {
    const seconds = samples.length / narrator.sampleRate;
    console.debug(describePiece(last, seconds));
    soFar.pieces++;
    soFar.seconds += seconds;
    for (const model of ['durationPredictor', 'textEncoder', 'vectorEstimator', 'vocoder'] as const)
      soFar[model] += last[model];
  }
  if (soFar.pieces > 0) {
    const n = soFar.pieces;
    const mean = {
      durationPredictor: soFar.durationPredictor / n,
      textEncoder: soFar.textEncoder / n,
      vectorEstimator: soFar.vectorEstimator / n,
      vocoder: soFar.vocoder / n,
    };
    lines.push(`${n} pieces, on average ${describePiece(mean, soFar.seconds / n)}`);
  }
  stopwatch.textContent = `${narrator.backend}, ${narrator.steps} steps. ${lines.join('. ')}.`;
  stopwatch.hidden = false;
}

/** A variant read over its trial's passage, as one WAV file. */
async function render(
  trial: Trial,
  variant: Variant,
  onPiece: (done: number, total: number) => void,
): Promise<Blob> {
  const passage = PASSAGES[trial.passage];
  const pieces = piecesOf(passageDocument(passage), passage.lang, 0);
  const parts: Float32Array[] = [];
  for (const [i, piece] of pieces.entries()) {
    const samples = await narrator.speak(piece.text, passage.lang, trial.voice, variant.tuning);
    showTimes(samples);
    parts.push(finishPiece(samples, narrator.sampleRate, piece.ends, variant.finish));
    onPiece(i + 1, pieces.length);
  }
  const all = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return new Blob([encodeWav(all, narrator.sampleRate)], { type: 'audio/wav' });
}

/** Both variants of a trial, in the order they will be played. */
type Pair = [first: Blob, second: Blob];

function renderPair(
  trial: Trial,
  first: 'a' | 'b',
  label: () => HTMLElement | null,
): Promise<Pair> {
  const order = first === 'a' ? [trial.a, trial.b] : [trial.b, trial.a];
  const progress = (which: string) => (done: number, total: number) => {
    const target = label();
    if (target) target.textContent = `Making the ${which} reading: ${done} of ${total} pieces`;
  };
  return (async (): Promise<Pair> => [
    await render(trial, order[0]!, progress('first')),
    await render(trial, order[1]!, progress('second')),
  ])();
}

function ask(): Promise<Answer['preferred']> {
  return new Promise((resolve) => {
    for (const button of choices.querySelectorAll('button')) {
      button.disabled = false;
      button.onclick = () => {
        for (const other of choices.querySelectorAll('button')) other.disabled = true;
        resolve(button.value as Answer['preferred']);
      };
    }
  });
}

function show(index: number, total: number, trial: Trial, pair: Pair): () => void {
  heading.textContent = `Trial ${index + 1} of ${total}`;
  passageTitle.textContent = `${PASSAGES[trial.passage].title}, read by ${trial.voice === 'M2' ? 'the Lector' : 'the Lectrix'}`;
  const urls = pair.map((blob) => URL.createObjectURL(blob));
  players.forEach((player, i) => (player.src = urls[i]!));
  // The first reading plays at once and the second follows it, once; both can be heard again.
  players[0].onended = () => {
    players[0].onended = null;
    void players[1].play();
  };
  void players[0].play();
  return () => {
    for (const player of players) {
      player.pause();
      player.onended = null;
      player.removeAttribute('src');
    }
    for (const url of urls) URL.revokeObjectURL(url);
  };
}

function report(answers: readonly Answer[], seed: number): void {
  const counts = tally(answers);
  const rows = TRIALS.map((trial) => {
    const count = counts[trial.name] ?? { a: 0, b: 0, same: 0 };
    return [
      trial.name,
      trial.voice,
      trial.passage,
      trial.a.label,
      trial.b.label,
      count.a,
      count.b,
      count.same,
    ];
  });
  const head = ['Trial', 'Voice', 'Passage', 'A', 'B', 'A preferred', 'B preferred', 'Same'];
  const table = document.createElement('table');
  const tr = (cells: readonly (string | number)[], tag: 'th' | 'td'): HTMLTableRowElement => {
    const row = document.createElement('tr');
    for (const cell of cells) {
      const el = document.createElement(tag);
      el.textContent = String(cell);
      row.append(el);
    }
    return row;
  };
  table.createTHead().append(tr(head, 'th'));
  table.createTBody().append(...rows.map((row) => tr(row, 'td')));
  const text = [
    `Voice lab, ${new Date().toISOString().slice(0, 10)}, seed ${seed}`,
    ...[head, ...rows].map((row) => row.join('\t')),
  ].join('\n');
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy as text';
  copy.onclick = async () => {
    await navigator.clipboard.writeText(text);
    copy.textContent = 'Copied';
  };
  results.replaceChildren(table, copy);
  results.hidden = false;
}

async function run(): Promise<void> {
  begin.disabled = true;
  status.textContent = 'Loading the voice…';
  await narrator.load();
  if (narrator.loadTimes) console.debug(describeLoad(narrator.loadTimes));
  showTimes();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const order = shuffle(TRIALS, seed);
  const answers: Answer[] = [];
  // The next trial is made while the current one is heard, so the wait between them is short.
  const made = new Map<number, Promise<Pair>>();
  const make = (i: number): Promise<Pair> | undefined => {
    const next = order[i];
    if (next === undefined) return undefined;
    if (!made.has(i))
      made.set(
        i,
        renderPair(next.trial, next.first, () => (i === current ? status : null)),
      );
    return made.get(i);
  };
  let current = 0;
  begin.hidden = true;
  for (; current < order.length; current++) {
    const { trial, first } = order[current]!;
    trialView.hidden = true;
    status.textContent = 'Making the readings…';
    const pair = await make(current)!;
    // A failure here is reported when that trial is reached.
    make(current + 1)?.catch(() => undefined);
    status.textContent = '';
    trialView.hidden = false;
    const leave = show(current, order.length, trial, pair);
    const preferred = await ask();
    leave();
    made.delete(current);
    answers.push({ name: trial.name, first, preferred });
  }
  trialView.hidden = true;
  status.textContent = 'Done. Here is what was set against what, and which was preferred.';
  report(answers, seed);
  narrator.destroy();
}

async function start(): Promise<void> {
  if (!(await isInstalled())) {
    status.textContent = `The voice is not set up at ${location.origin}. Set it up in the Lectorium on this same address, then come back.`;
    return;
  }
  status.textContent = `${TRIALS.length} trials. Each reads a passage twice, in a hidden order. Use headphones.`;
  begin.hidden = false;
  begin.onclick = () => {
    run().catch((error: unknown) => {
      status.textContent = `The lab stopped: ${error instanceof Error ? error.message : String(error)}`;
      narrator.destroy();
    });
  };
}

void start();
