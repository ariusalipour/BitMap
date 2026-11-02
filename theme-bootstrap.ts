// Apply the initial preference before styles paint, without an inline CSP exception.
import { readStoredTheme, resolveTheme } from './theme';
let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* Storage may be disabled. */ }
document.documentElement.dataset.theme = resolveTheme(readStoredTheme(storage), window.matchMedia('(prefers-color-scheme: dark)').matches);
