# Privacy

Copista runs entirely in your browser. It has no account, no server-side
processing, no analytics, no cookies and no advertising.

## What is stored, and where

Everything Copista keeps is stored in your browser's IndexedDB, on your
device:

- the books you add to the library;
- your reading position in each book;
- your bookmarks;
- your reading settings (text size and page colours).

None of this is uploaded. Copista does not send requests to any site other
than the one it is served from, and an automated test checks this.

Files you open in the Scriptorium are read in memory to convert them and are
not stored. The converted file is handed to your browser as a download.

Copista may ask the browser to keep its storage persistent, so that the
browser does not clear your library when space runs low. The browser decides
whether to allow this.

## The host

The app files (HTML, scripts, styles, icons) are downloaded from the site that
hosts Copista. Like any web host, that site may keep ordinary request logs,
such as IP addresses and times. Copista adds nothing to those requests. After
the first visit the app works offline from your browser's cache.

The public copy of Copista is hosted on GitHub Pages, so GitHub is that host
and its own privacy statement applies:
https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement.

## Deleting your data

The Archivum has a "Delete all my data" button. It removes the library,
positions, bookmarks and settings from this browser. Clearing the site's data
in your browser settings does the same.

## Contact

Questions about privacy can be opened as an issue in the project's repository.
