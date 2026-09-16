import { Platform } from 'react-native';

/** Sidebar + inspector need this much width. Below it, use the mobile chrome. */
export const DESKTOP_MIN_WIDTH = 900;

export function isDesktopWeb(width: number): boolean {
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}

export const WEB_SHELL = Platform.OS === 'web'
  ? ({ height: '100%' as const, minHeight: 0 as const, minWidth: 0 as const, overflow: 'hidden' as const })
  : ({});
