/**
 * The light or dark interface. It follows the system until the visitor picks one; the pick is
 * kept in localStorage under KEY (public/theme.js reads it before the first paint).
 */
export type Theme = 'light' | 'dark';

const KEY = 'copista-theme';
/** The page colour of each theme, for the browser's own toolbar. */
const PAPER: Record<Theme, string> = { light: '#f6f4ef', dark: '#110f0d' };

const root = document.documentElement;
const systemDark = matchMedia('(prefers-color-scheme: dark)');

function saved(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function system(): Theme {
  return systemDark.matches ? 'dark' : 'light';
}

export const look = $state({ theme: saved() ?? system() });

function apply(theme: Theme): void {
  look.theme = theme;
  root.dataset.theme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = PAPER[theme];
  }
}

export function stillMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Applies the starting theme and follows the system while nothing is picked. */
export function watchTheme(): () => void {
  apply(look.theme);
  const follow = (): void => {
    if (!saved()) apply(system());
  };
  systemDark.addEventListener('change', follow);
  return () => systemDark.removeEventListener('change', follow);
}

/** Switches theme, revealing the new one in a circle that grows from the point given. */
export function toggleTheme(from?: { x: number; y: number }): void {
  const next: Theme = look.theme === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Not kept, but still switched for this visit.
  }
  if (!document.startViewTransition || stillMotion()) {
    apply(next);
    return;
  }
  const x = from?.x ?? innerWidth - 40;
  const y = from?.y ?? 32;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.dataset.nav = 'theme';
  const transition = document.startViewTransition(() => apply(next));
  void transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 760,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch(() => undefined);
  void transition.finished.finally(() => {
    if (root.dataset.nav === 'theme') delete root.dataset.nav;
  });
}

/** Forgets the pick, as part of deleting everything Copista keeps. */
export function forgetTheme(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing kept.
  }
  apply(system());
}
