/* global document, navigator, window */
// Says so when the app did not start, where an older browser, such as an e-reader's, left the
// page blank, and names the browser, so its user can tell which one it is.
// Written in old JavaScript on purpose: it has to run where the app's own code cannot.
window.addEventListener('load', function () {
  var app = document.getElementById('app');
  if (!app) return;
  for (var i = 0; i < app.children.length; i++) {
    if (app.children[i].tagName !== 'NOSCRIPT') return;
  }
  var box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'max-width:32em;margin:3em auto;padding:0 1em;font:1.1em/1.5 Georgia,serif';
  var title = document.createElement('h1');
  title.textContent = 'Copista does not run in this browser';
  var text = document.createElement('p');
  text.textContent =
    'It needs a recent version of Chrome, Edge, Firefox or Safari. Nothing was sent anywhere.';
  var agent = document.createElement('p');
  agent.style.cssText = 'font-size:0.8em;word-break:break-all';
  agent.textContent = 'Your browser: ' + navigator.userAgent;
  box.appendChild(title);
  box.appendChild(text);
  box.appendChild(agent);
  app.textContent = '';
  app.appendChild(box);
});
