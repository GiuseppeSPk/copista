/** Stroke paths on a 24 by 24 grid, drawn at one weight by Icon.svelte. */
export const PATHS = {
  library: 'M4 4.5h4v15H4zM10 7h4v12.5h-4zM15.6 7.4l3.7-1 3.2 12.6-3.7 1z',
  read: 'M12 6.6C10 5.1 7 4.6 3 5v13.2c4-.4 7 .1 9 1.6 2-1.5 5-2 9-1.6V5c-4-.4-7 .1-9 1.6zM12 6.6v13.2',
  convert: 'M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4',
  archive: 'M3 4.5h18v4.5H3zM5 9v10.5h14V9M9.5 13h5',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  external: 'M14 4h6v6m0-6-9 9m7 1v6H4V6h6',
  back: 'M20 12H4m6-6-6 6 6 6',
  file: 'M14 3H6v18h12V7zm0 0v4h4M12 10.5v6.5m-3-3h6',
  trash: 'M4 7h16M9.5 7V4h5v3M6 7l1 13h10l1-13',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  sun: 'M12 2.75v1.5m0 15.5v1.5M2.75 12h1.5m15.5 0h1.5M5.5 5.5l1.06 1.06m10.88 10.88 1.06 1.06M5.5 18.5l1.06-1.06M17.44 6.56l1.06-1.06M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  moon: 'M20 14.6A8.5 8.5 0 0 1 9.4 4 8.5 8.5 0 1 0 20 14.6z',
} as const;

export type IconName = keyof typeof PATHS;
