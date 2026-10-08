/** Hands a converted file to the browser's download manager. */
export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Opens the print dialog on a standalone document, from which the reader can
 * save a PDF. The document is loaded in a hidden frame of the same page.
 */
export function printHtml(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const frame = document.createElement('iframe');
  frame.title = 'Print view';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.src = url;
  frame.onload = () => {
    frame.contentWindow?.print();
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.append(frame);
}
