/**
 * The offer to install Copista on the home screen, where the browser can make one (Chrome and
 * its kin on Android). The browser's own offer is caught as soon as this module loads, before
 * the interface is mounted, and held until the reader takes it or turns it down.
 */

/** The event Chromium fires when the page could be installed; not in the DOM typings. */
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const KEY = 'copista-install-later';
/** How long "Not now" keeps the offer away. */
export const QUIET_MS = 14 * 24 * 60 * 60 * 1000;

let held: InstallEvent | undefined;

export const install = $state({ offered: false });

function quietUntil(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** A touch screen: the offer is for phones and tablets, where the home screen is the way in. */
function onTouch(): boolean {
  return matchMedia('(pointer: coarse)').matches;
}

addEventListener('beforeinstallprompt', (event) => {
  // Kept for our own offer instead of the browser's bar, which most readers never notice.
  event.preventDefault();
  held = event as InstallEvent;
  install.offered = onTouch() && Date.now() >= quietUntil();
});

addEventListener('appinstalled', () => {
  held = undefined;
  install.offered = false;
});

/** Opens the browser's install dialog. */
export async function accept(): Promise<void> {
  const event = held;
  held = undefined;
  install.offered = false;
  if (!event) return;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'dismissed') later();
}

/** Puts the offer away for QUIET_MS. */
export function later(): void {
  install.offered = false;
  try {
    localStorage.setItem(KEY, String(Date.now() + QUIET_MS));
  } catch {
    // Not kept: the offer may come back on the next visit.
  }
}
