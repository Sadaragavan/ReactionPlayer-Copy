/** Browser file, canvas and clipboard helpers. */

export function readAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The canvas produced no image.'))), type, quality)
  );
}

/** Writes the canvas to the system clipboard as a PNG. Throws when the browser refuses. */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('This browser cannot copy images to the clipboard.');
  }
  const blob = await canvasToBlob(canvas, 'image/png');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** `saved`: handed over (a plain download is never reported back, so it counts); `declined`: the person said no; `failed`: it could not be offered. */
export type SaveOutcome = 'saved' | 'declined' | 'failed';

type DownloadsHost = { save(request: { filename: string; data: Blob }): Promise<unknown> };

/**
 * Gives the person a generated file. Inside a sandboxed viewer (the hosted preview) a page cannot start a
 * download itself: it asks the viewer through its `downloads` capability, which shows a confirmation first.
 * Anywhere else this is an ordinary browser download.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<SaveOutcome> {
  const host = (globalThis as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
  if (typeof host?.use === 'function') {
    let downloads: DownloadsHost | null = null;
    try {
      downloads = (await host.use('downloads')) as DownloadsHost | null;
    } catch {
      downloads = null;
    }
    if (downloads) {
      try {
        await downloads.save({ filename, data: blob });
        return 'saved';
      } catch (err) {
        return (err as { code?: string } | null)?.code === 'declined' ? 'declined' : 'failed';
      }
    }
  }
  downloadBlob(blob, filename);
  return 'saved';
}

export const saveJSON = (data: unknown, filename: string) =>
  saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);

/** `my_reaction-clip.final.mp4` → `my reaction clip final` */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled';
}

/** Turns a title into a safe file name. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';

/**
 * Opens the native file dialog. Resolves with the chosen files, or an empty
 * array if the dialog was dismissed.
 */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => done([]));
    document.body.appendChild(input);
    input.click();
  });
}

/** Downscales an image file to a square-ish JPEG data URL (used for avatars). */
export async function downscaleToDataURL(file: Blob, maxEdge = 256, quality = 0.86): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
