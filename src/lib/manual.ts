import { isNative, shareFile } from './native';

/**
 * The user manual ships with the app (public/manual/): an HTML page that works offline,
 * plus the same content as a PDF. Regenerate both with scripts/manual/*.mjs.
 */
export const MANUAL_PAGE = '/manual/index.html';
export const MANUAL_PDF = '/manual/Moneta-User-Manual.pdf';

/** Web: open in a new tab. App: open the bundled page inside the app (Android back returns). */
export function openManual() {
  if (isNative) location.href = MANUAL_PAGE;
  else window.open(MANUAL_PAGE, '_blank', 'noopener');
}

/** Web: download the PDF. App: hand the bundled PDF to Android ("Open with…", Drive, WhatsApp…). */
export async function getManualPdf() {
  if (!isNative) {
    const a = document.createElement('a');
    a.href = MANUAL_PDF;
    a.download = 'Moneta-User-Manual.pdf';
    a.click();
    return;
  }
  const blob = await (await fetch(MANUAL_PDF)).blob();
  await shareFile(blob, 'Moneta-User-Manual.pdf');
}
