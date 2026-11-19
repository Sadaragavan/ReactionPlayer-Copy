/**
 * `use:dropzone` — accept dropped files.
 *
 * While a file hovers over the node it gets `data-dragging="true"` (style it
 * with `data-[dragging=true]:…`). On desktop the dropped file's absolute path is
 * captured (`webUtils.getPathForFile`), so the session can reopen it after a
 * restart. In a Chromium browser the FileSystemFileHandle is captured instead.
 */
import { pickedFromFile, type FsFileHandle, type PickedFile } from '../engine/media';

export interface DropOptions {
  accept: 'video' | 'image' | 'any';
  /** Take every matching file (default: only the first). */
  multiple?: boolean;
  disabled?: boolean;
  onfiles: (files: PickedFile[]) => void;
}

const VIDEO_EXT = /\.(mkv|mov|mp4|m4v|webm|ogv)$/i;

const accepts = (kind: DropOptions['accept'], f: File) =>
  kind === 'any' || (kind === 'video' ? f.type.startsWith('video/') || VIDEO_EXT.test(f.name) : f.type.startsWith('image/'));

type HandleItem = DataTransferItem & { getAsFileSystemHandle?: () => Promise<{ kind: string } | null> };

export function dropzone(node: HTMLElement, options: DropOptions) {
  let o = options;
  let depth = 0;

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const clear = () => {
    depth = 0;
    delete node.dataset.dragging;
  };

  const enter = (e: DragEvent) => {
    if (o.disabled || !hasFiles(e)) return;
    e.preventDefault();
    depth++;
    node.dataset.dragging = 'true';
  };
  const over = (e: DragEvent) => {
    if (o.disabled || !hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const leave = () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) delete node.dataset.dragging;
  };
  const drop = (e: DragEvent) => {
    if (o.disabled || !hasFiles(e)) return;
    e.preventDefault();
    clear();
    // DataTransfer is only readable during the event, so gather everything now.
    const gathered = Array.from(e.dataTransfer?.items ?? [])
      .filter((i) => i.kind === 'file')
      .map((i) => ({ file: i.getAsFile(), handle: (i as HandleItem).getAsFileSystemHandle?.() }));
    void Promise.all(
      gathered.map(async ({ file, handle }): Promise<PickedFile | null> => {
        if (!file || !accepts(o.accept, file)) return null;
        let h: FsFileHandle | undefined;
        try {
          const resolved = await handle;
          if (resolved?.kind === 'file') h = resolved as unknown as FsFileHandle;
        } catch {
          /* not supported or denied: the file itself is enough */
        }
        return pickedFromFile(file, h);
      })
    ).then((list) => {
      const files = list.filter((x): x is PickedFile => x !== null);
      if (files.length) o.onfiles(o.multiple ? files : files.slice(0, 1));
    });
  };

  node.addEventListener('dragenter', enter);
  node.addEventListener('dragover', over);
  node.addEventListener('dragleave', leave);
  node.addEventListener('drop', drop);
  return {
    update(next: DropOptions) {
      o = next;
    },
    destroy() {
      node.removeEventListener('dragenter', enter);
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    }
  };
}
