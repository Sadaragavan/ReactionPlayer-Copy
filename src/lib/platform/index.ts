/**
 * Where the app is running.
 *
 * Inside Electron the preload script puts a typed bridge on `window.electronAPI`.
 * In a plain browser (`npm run dev:web`) it is absent, and every caller falls
 * back to browser behaviour: IndexedDB, `<input type="file">`, blob URLs.
 */
import type { ElectronAPI } from '../../shared/api';

export const desktop: ElectronAPI | null = typeof window !== 'undefined' ? (window.electronAPI ?? null) : null;
export const isDesktop = desktop !== null;
