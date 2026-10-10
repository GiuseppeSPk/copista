import { createRequire } from 'node:module';

// jsdom files every element with an id under window[id], from any document that shares the
// window, the parsed ones included, and lets go only when the element is removed. Documents
// that are simply dropped stay on file, so a run over many books runs out of memory. Only the
// window's own document should be on file, as in a browser.
type Element = { _ownerDocument: { _defaultView: unknown } };
type Hook = (element: Element, ...rest: unknown[]) => void;

const windowProperties = createRequire(import.meta.url)(
  'jsdom/lib/jsdom/living/window-properties.js',
) as Record<'elementAttached' | 'elementAttributeModified', Hook>;

for (const name of ['elementAttached', 'elementAttributeModified'] as const) {
  const hook = windowProperties[name];
  windowProperties[name] = (element, ...rest) => {
    if (element._ownerDocument._defaultView !== null) hook(element, ...rest);
  };
}

// Each document jsdom runs a selector in gets a selector engine of its own, which listens on
// the window for focus, key and mouse events and so is never let go, nor is the last tree it
// searched. A parsed book is searched in a document of its own, so every book stays. The
// tests send no such events, so the engines need not hear them.
const SELECTOR_HANDLERS = new Set([
  '_handleFocusEvent',
  '_handleKeyboardEvent',
  '_handleMouseEvent',
]);
const addEventListener = window.addEventListener.bind(window);
window.addEventListener = (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
) => {
  if (typeof listener === 'function' && SELECTOR_HANDLERS.has(listener.name)) return;
  addEventListener(type, listener, options);
};
