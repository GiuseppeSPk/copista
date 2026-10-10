/* global document, localStorage, matchMedia */
// Sets the light or dark theme before the first paint, so the page never flashes the other one.
// A classic script in a file of its own: the content security policy allows no inline code.
(function () {
  let saved = null;
  try {
    saved = localStorage.getItem('copista-theme');
  } catch {
    // Storage blocked: follow the system.
  }
  const dark =
    saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
