/**
 * What the file choosers offer: books for the library, and every format the Scriptorium
 * reads. Pictures have a chooser of their own: on Android, a chooser that names any picture
 * type opens the photo gallery and nothing else.
 */
export const BOOK_FILES = '.epub,application/epub+zip';
export const CONVERTIBLE_FILES =
  '.epub,.docx,.md,.markdown,.txt,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain';
/** The pictures a Markdown file may show. */
export const PICTURE_FILES =
  '.png,.jpg,.jpeg,.gif,.svg,.webp,image/png,image/jpeg,image/gif,image/svg+xml,image/webp';

/** Hands a converted file to the browser's download manager. */
export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
