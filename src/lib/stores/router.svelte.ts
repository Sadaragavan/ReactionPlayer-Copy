/**
 * Hash router.
 *
 * Hash routes need no server rewrites, so the build works from any static host
 * (or from `file://`, which is how the desktop app loads). Settings is one route with two tabs:
 *
 *   #/                      Home hub
 *   #/session               Playback interface
 *   #/presets               Presets & frame-sampling studio
 *   #/sessions              Session browser
 *   #/settings/<tab>        appearance | preferences
 */
import type { Route, RouteName, SettingsTab } from '../types';

const NAMES: RouteName[] = ['home', 'session', 'presets', 'sessions', 'settings'];
export const SETTINGS_TABS: SettingsTab[] = ['appearance', 'preferences'];

export function parseHash(hash: string): Route {
  const [first, second] = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  const name = (NAMES as string[]).includes(first) ? (first as RouteName) : 'home';
  if (name !== 'settings') return { name };
  const tab = (SETTINGS_TABS as string[]).includes(second) ? (second as SettingsTab) : 'appearance';
  return { name, tab };
}

export function hrefFor(route: Route): string {
  if (route.name === 'home') return '#/';
  if (route.name === 'settings') return `#/settings/${route.tab ?? 'appearance'}`;
  return `#/${route.name}`;
}

class Router {
  route = $state<Route>(parseHash(typeof location === 'undefined' ? '' : location.hash));

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('hashchange', () => {
      this.route = parseHash(location.hash);
    });
  }

  /** Navigate. `replace` swaps the history entry instead of adding one (used by guards). */
  go(target: Route | RouteName, opts: { replace?: boolean } = {}): void {
    const route: Route = typeof target === 'string' ? { name: target } : target;
    this.route = route;
    const href = hrefFor(route);
    if (opts.replace) location.replace(href);
    else location.hash = href;
  }

  is(name: RouteName): boolean {
    return this.route.name === name;
  }
}

export const router = new Router();
