// Resolve theme preferences and keep system changes separate from explicit choices.
export type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'bitmap.theme';

export function resolveTheme(stored: string | null | undefined, prefersDark: boolean): Theme {
  return stored === 'light' || stored === 'dark' ? stored : prefersDark ? 'dark' : 'light';
}

export function readStoredTheme(storage?: Pick<Storage, 'getItem'>): string | null {
  try { return storage?.getItem(THEME_STORAGE_KEY) ?? null; } catch { return null; }
}

export function createThemeController(
  root: Pick<HTMLElement, 'dataset'>,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  media: Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>,
  onChange: (theme: Theme) => void,
) {
  const stored = readStoredTheme(storage);
  let explicit = stored === 'light' || stored === 'dark';
  let current = resolveTheme(stored, media.matches);
  const apply = (theme: Theme) => { current = theme; root.dataset.theme = theme; onChange(theme); };
  const systemChange = () => { if (!explicit) apply(resolveTheme(null, media.matches)); };
  apply(current);
  media.addEventListener('change', systemChange);
  return {
    get current() { return current; },
    toggle() {
      explicit = true;
      const next = current === 'dark' ? 'light' : 'dark';
      try { storage?.setItem(THEME_STORAGE_KEY, next); } catch { /* The current visit still supports theming. */ }
      apply(next);
    },
    destroy() { media.removeEventListener('change', systemChange); },
  };
}
