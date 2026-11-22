/**
 * Electron main process.
 *
 * Responsibilities, in the order they happen:
 *   1. Chromium switches for hardware-accelerated playback (must run before `ready`).
 *   2. The privileged `local-media://` scheme (must be registered before `ready`).
 *   3. One window: black, dark-themed, sandboxed, no Node in the page.
 *   4. IPC for files, dialogs, clipboard, fullscreen and the data folder.
 *   5. CORS-free remote video, so frames can be copied without tainting the canvas.
 */
import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, Menu, nativeImage, nativeTheme, protocol, session, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PickedPath, SaveOutcome, StoredWallpaper } from '../src/shared/api';
import { MEDIA_SCHEME, VIDEO_EXTENSIONS, isVideoPath, toMediaUrl } from '../src/shared/mediaUrl';
import { SUBTITLE_EXTENSIONS, isSubtitlePath } from '../src/shared/subtitles';
import { handleMediaRequest } from './media';
import { Storage, writeFileAtomic } from './storage';
import { Proxies } from './proxy';
import { extractSubtitles, probeTracks } from './tracks';

/* ── 1. Chromium switches ─────────────────────────────────────────────────── */

/**
 * Smooth dual-1080p60 needs the GPU to decode and to present the frames without
 * copying them. On Linux that is VA-API under Wayland (Hyprland / Omarchy) or X11.
 * `enable-features` can only be set once, so every feature goes into one call.
 */
function configureChromium(): void {
  const features: string[] = [];
  if (process.platform === 'linux') {
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
    features.push('VaapiVideoDecodeLinuxGL', 'VaapiVideoDecoder', 'WaylandWindowDecorations');
  } else {
    // HEVC (H.265) is common in anime and movie rips; Chromium decodes it only through the platform's hardware decoder.
    features.push('PlatformHEVCDecoderSupport');
  }
  if (features.length) app.commandLine.appendSwitch('enable-features', features.join(','));
  // Without this Chromium leaves `video.audioTracks` undefined, so a file with several audio tracks looks like it has one.
  app.commandLine.appendSwitch('enable-blink-features', 'AudioVideoTracks');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
}
configureChromium();

/* ── 2. local-media:// ────────────────────────────────────────────────────── */

protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true }
  }
]);

/* ── state ────────────────────────────────────────────────────────────────── */

nativeTheme.themeSource = 'dark';

const DEV_URL = process.env['ELECTRON_RENDERER_URL'];
const RENDERER_FILE = join(import.meta.dirname, '../renderer/index.html');
const APP_URL_PREFIXES = [pathToFileURL(RENDERER_FILE).href, ...(DEV_URL ? [DEV_URL] : [])];
const isAppUrl = (url: string) => APP_URL_PREFIXES.some((p) => url.startsWith(p));

let win: BrowserWindow | null = null;
let storage!: Storage;
let proxies!: Proxies;

/* ── 3. window ────────────────────────────────────────────────────────────── */

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Reaction Player',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    // Packaged builds take their icon from the installer / .desktop file; in development use the source icon.
    ...(app.isPackaged ? {} : { icon: join(import.meta.dirname, '../../build/icon.png') }),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      // The sync loop must keep its rhythm while the window is covered or unfocused.
      backgroundThrottling: false,
      // The player starts and syncs several media elements itself; the browser's autoplay rules would silence the extra audio.
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  const w = win;
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => {
    win = null;
  });
  const sendFullscreen = (on: boolean) => w.webContents.send('rp:fullscreen', on);
  w.on('enter-full-screen', () => sendFullscreen(true));
  w.on('leave-full-screen', () => sendFullscreen(false));

  // The page never navigates away, and nothing it opens becomes a window of ours.
  w.webContents.on('will-navigate', (e, url) => {
    if (isAppUrl(url)) return;
    e.preventDefault();
    openExternal(url);
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_URL) void w.loadURL(DEV_URL);
  else void w.loadFile(RENDERER_FILE);
}

function openExternal(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

/* ── 4. IPC ───────────────────────────────────────────────────────────────── */

/** Only our own window, showing our own page, may call in. */
function trusted(e: IpcMainInvokeEvent): boolean {
  return !!win && e.sender === win.webContents && isAppUrl(e.senderFrame?.url ?? '');
}

function handle<A extends unknown[], R>(channel: string, fn: (e: IpcMainInvokeEvent, ...args: A) => R | Promise<R>): void {
  ipcMain.handle(channel, (e, ...args) => {
    if (!trusted(e)) throw new Error(`Blocked ${channel}: untrusted sender.`);
    return fn(e, ...(args as A));
  });
}

const str = (v: unknown, max = 4096): string => {
  if (typeof v !== 'string' || v.length > max) throw new Error('Invalid argument.');
  return v;
};

/** Subtitle files are often Windows-1252 rather than UTF-8: try UTF-8, then fall back. */
function decodeText(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

async function readSubtitleFile(path: string): Promise<string | null> {
  if (!isSubtitlePath(path)) return null;
  try {
    if ((await stat(path)).size > 10_000_000) return null;
    return decodeText(await readFile(path));
  } catch {
    return null;
  }
}

/** Subtitle files beside a video: `episode.srt`, `episode.en.srt`… (same name up to the first dot after the video's name). */
async function findSidecars(videoPath: string): Promise<{ path: string; name: string }[]> {
  const stem = basename(videoPath, extname(videoPath)).toLowerCase();
  try {
    return (await readdir(dirname(videoPath)))
      .filter((n) => isSubtitlePath(n) && n.toLowerCase().startsWith(stem) && /^[.\-_ ]|^\.[a-z]/i.test(n.slice(stem.length) || '.'))
      .slice(0, 20)
      .map((n) => ({ path: join(dirname(videoPath), n), name: n }));
  } catch {
    return [];
  }
}

function registerIpc(): void {
  handle('rp:quit', () => {
    app.quit();
  });

  handle('rp:fullscreen:set', (_e, on: boolean) => {
    win?.setFullScreen(!!on);
    return !!on;
  });
  handle('rp:fullscreen:get', () => win?.isFullScreen() ?? false);

  handle('rp:pick-videos', async (_e, multiple: boolean): Promise<PickedPath[]> => {
    if (!win) return [];
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose a video',
      properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [{ name: 'Video', extensions: [...VIDEO_EXTENSIONS] }]
    });
    if (res.canceled) return [];
    const out: PickedPath[] = [];
    for (const path of res.filePaths) {
      try {
        out.push({ path, name: basename(path), size: (await stat(path)).size });
      } catch {
        /* vanished between the dialog and now */
      }
    }
    return out;
  });

  handle('rp:stat', async (_e, path: string) => {
    try {
      const info = await stat(str(path));
      return info.isFile() ? { size: info.size, mtimeMs: info.mtimeMs } : null;
    } catch {
      return null;
    }
  });

  handle('rp:save-json', async (_e, defaultName: string, text: string): Promise<SaveOutcome> => {
    if (!win) return 'failed';
    try {
      const res = await dialog.showSaveDialog(win, {
        title: 'Export session',
        defaultPath: basename(str(defaultName, 200)),
        filters: [{ name: 'Reaction Player session', extensions: ['json'] }]
      });
      if (res.canceled || !res.filePath) return 'declined';
      await writeFileAtomic(res.filePath, str(text, 50_000_000));
      return 'saved';
    } catch {
      return 'failed';
    }
  });

  handle('rp:open-json', async () => {
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      title: 'Load a session file',
      properties: ['openFile'],
      filters: [{ name: 'Reaction Player session', extensions: ['json'] }]
    });
    const path = res.filePaths[0];
    if (res.canceled || !path) return null;
    if ((await stat(path)).size > 20_000_000) throw new Error('That file is too large to be a session.');
    return { name: basename(path), text: await readFile(path, 'utf8') };
  });

  handle('rp:copy-image', async (_e, dataUrl: string) => {
    if (!/^data:image\/(png|jpeg);base64,/.test(str(dataUrl, 200_000_000))) throw new Error('Not an image.');
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty()) throw new Error('The image could not be read.');
    // Electron 45's clipboard is the W3C one: write a ClipboardItem. The native image has re-encoded the picture as a clean PNG.
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }) })]);
  });

  /* ── tracks and subtitles ── */

  handle('rp:sub:probe', async (_e, path: string) => {
    if (!isVideoPath(str(path))) return { audio: [], subtitles: [], sidecars: [] };
    return { ...(await probeTracks(path)), sidecars: await findSidecars(path) };
  });
  handle('rp:sub:extract', async (_e, path: string, track: number) => (isVideoPath(str(path)) && Number.isInteger(track) ? extractSubtitles(path, track) : []));
  handle('rp:sub:read', (_e, path: string) => readSubtitleFile(str(path)));
  handle('rp:sub:pick', async () => {
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, { title: 'Choose a subtitle file', properties: ['openFile'], filters: [{ name: 'Subtitles', extensions: [...SUBTITLE_EXTENSIONS] }] });
    const path = res.filePaths[0];
    if (res.canceled || !path) return null;
    const text = await readSubtitleFile(path);
    return text === null ? null : { path, name: basename(path), text };
  });

  handle('rp:proxy:audio', async (e, path: string, index: number) => {
    if (!isVideoPath(str(path)) || !Number.isInteger(index) || index < 0 || index > 64) throw new Error('Invalid audio request.');
    const file = await proxies.audio(path, index, (fraction) => {
      if (!e.sender.isDestroyed()) e.sender.send('rp:proxy-progress', { path, index, fraction });
    });
    return { url: toMediaUrl(file) };
  });

  handle('rp:gpu', async () => {
    const status = app.getGPUFeatureStatus() as unknown as Record<string, string>;
    let renderer = '';
    try {
      const info = (await app.getGPUInfo('basic')) as { gpuDevice?: { active?: boolean; deviceString?: string; vendorString?: string }[] };
      const gpu = info.gpuDevice?.find((g) => g.active) ?? info.gpuDevice?.[0];
      renderer = [gpu?.vendorString, gpu?.deviceString].filter(Boolean).join(' ');
    } catch {
      /* unknown */
    }
    return { videoDecode: status.video_decode ?? 'unknown', rasterization: status.rasterization ?? 'unknown', renderer };
  });

  handle('rp:reveal-data', async () => {
    await shell.openPath(storage.root);
  });

  handle('rp:storage:path', () => storage.root);
  handle('rp:storage:read-settings', () => storage.readSettings());
  handle('rp:storage:write-settings', (_e, data: Record<string, unknown>) => storage.writeSettings(data));
  handle('rp:storage:list-sessions', () => storage.listSessions());
  handle('rp:storage:read-session', (_e, id: string) => storage.readSession(str(id, 100)));
  handle('rp:storage:write-session', (_e, id: string, s: unknown) => storage.writeSession(str(id, 100), s));
  handle('rp:storage:delete-session', (_e, id: string) => storage.deleteSession(str(id, 100)));
  handle('rp:storage:read-presets', () => storage.readPresets());
  handle('rp:storage:write-presets', (_e, list: unknown[]) => storage.writePresets(Array.isArray(list) ? list : []));
  handle('rp:storage:read-wallpaper', () => storage.readWallpaper());
  handle('rp:storage:write-wallpaper', (_e, w: StoredWallpaper) => storage.writeWallpaper(w));
  handle('rp:storage:delete-wallpaper', () => storage.deleteWallpaper());
  handle('rp:storage:clear', () => storage.clearAll());
}

/* ── 5. remote video without CORS errors ──────────────────────────────────── */

/**
 * A `<video crossorigin="anonymous">` only keeps the canvas clean when the host
 * answers with permissive CORS headers, and many hosts do not. Rewriting them on
 * media responses lets “Copy frame” and the Alignment Studio read remote pixels.
 */
function relaxMediaCors(): void {
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const headers = details.responseHeaders ?? {};
    const type = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1]?.[0] ?? '';
    // Images too: the wallpaper's colours are read from its pixels, which a canvas allows only for a picture its host permits.
    if (details.resourceType !== 'media' && details.resourceType !== 'image' && !type.toLowerCase().startsWith('video/')) return callback({});
    const next = { ...headers };
    for (const key of Object.keys(next)) {
      if (/^(access-control-allow-origin|access-control-allow-credentials|cross-origin-resource-policy)$/i.test(key)) delete next[key];
    }
    next['Access-Control-Allow-Origin'] = ['*'];
    next['Cross-Origin-Resource-Policy'] = ['cross-origin'];
    callback({ responseHeaders: next });
  });
}

/* ── lifecycle ────────────────────────────────────────────────────────────── */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  void app.whenReady().then(() => {
    storage = new Storage(app.getPath('userData'));
    proxies = new Proxies(join(app.getPath('userData'), 'cache', 'audio'));
    void proxies.prune();
    protocol.handle(MEDIA_SCHEME, (request) => handleMediaRequest(request));
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    relaxMediaCors();
    registerIpc();

    // Windows and Linux have no use for a menu bar; macOS needs one for Quit, Copy and Paste.
    Menu.setApplicationMenu(
      process.platform === 'darwin'
        ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
        : null
    );

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());

  // Let queued writes (the session's last playhead, the settings) land before the process ends.
  let flushed = false;
  app.on('before-quit', (e) => {
    if (flushed || !storage) return;
    e.preventDefault();
    flushed = true;
    void storage.idle().finally(() => app.quit());
  });
}
