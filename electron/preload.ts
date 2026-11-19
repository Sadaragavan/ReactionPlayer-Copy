/**
 * Preload script: the only bridge between the page and the main process.
 *
 * The page runs with `contextIsolation: true`, `sandbox: true` and no Node, so
 * everything it may do is listed here as a small typed object on
 * `window.electronAPI`. Each method is one IPC channel (see `electron/main.ts`).
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ElectronAPI } from '../src/shared/api';

const invoke = <T>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api: ElectronAPI = {
  platform: process.platform as ElectronAPI['platform'],

  quitApp: () => invoke('rp:quit'),

  setFullScreen: (on) => invoke('rp:fullscreen:set', on),
  isFullScreen: () => invoke('rp:fullscreen:get'),
  onFullScreenChange(listener) {
    const handler = (_e: Electron.IpcRendererEvent, on: boolean) => listener(on);
    ipcRenderer.on('rp:fullscreen', handler);
    return () => ipcRenderer.removeListener('rp:fullscreen', handler);
  },

  pickVideos: (multiple) => invoke('rp:pick-videos', multiple),
  pathForFile(file) {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  statFile: (path) => invoke('rp:stat', path),
  saveJson: (defaultName, text) => invoke('rp:save-json', defaultName, text),
  openJson: () => invoke('rp:open-json'),
  copyImage: (dataUrl) => invoke('rp:copy-image', dataUrl),
  revealDataFolder: () => invoke('rp:reveal-data'),

  storage: {
    userDataPath: () => invoke('rp:storage:path'),
    readSettings: () => invoke('rp:storage:read-settings'),
    writeSettings: (data) => invoke('rp:storage:write-settings', data),
    listSessions: () => invoke('rp:storage:list-sessions'),
    readSession: (id) => invoke('rp:storage:read-session', id),
    writeSession: (id, session) => invoke('rp:storage:write-session', id, session),
    deleteSession: (id) => invoke('rp:storage:delete-session', id),
    readPresets: () => invoke('rp:storage:read-presets'),
    writePresets: (presets) => invoke('rp:storage:write-presets', presets),
    writeWallpaper: (w) => invoke('rp:storage:write-wallpaper', w),
    readWallpaper: () => invoke('rp:storage:read-wallpaper'),
    deleteWallpaper: () => invoke('rp:storage:delete-wallpaper'),
    clearAll: () => invoke('rp:storage:clear')
  }
};

contextBridge.exposeInMainWorld('electronAPI', api);
