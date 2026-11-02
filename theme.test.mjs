import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';
const { code } = await transform(await readFile(new URL('./theme.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' });
const { createThemeController, resolveTheme, THEME_STORAGE_KEY } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('saved choices override the system; invalid preferences fall back to the system', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('unexpected', true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
});
function fixture(stored = null, brokenStorage = false, prefersDark = false) {
  const root = { dataset: {} };
  const media = Object.assign(new EventTarget(), { matches: prefersDark });
  const choices = [];
  const storage = { getItem() { if (brokenStorage) throw Error('Disabled'); return stored; }, setItem(key, value) { if (brokenStorage) throw Error('Disabled'); assert.equal(key, THEME_STORAGE_KEY); stored = value; } };
  const controller = createThemeController(root, storage, media, theme => choices.push(theme));
  const system = dark => { media.matches = dark; media.dispatchEvent(new Event('change')); };
  return { root, controller, choices, system, get stored() { return stored; } };
}
test('system changes apply until a user chooses a theme, then persist across visits', () => {
  const f = fixture();
  f.system(true);
  assert.equal(f.root.dataset.theme, 'dark');
  f.controller.toggle();
  assert.equal(f.stored, 'light');
  f.system(true);
  assert.equal(f.controller.current, 'light');
  const reloaded = fixture(f.stored, false, true);
  assert.equal(reloaded.controller.current, 'light');
  f.controller.destroy(); reloaded.controller.destroy();
});
test('disabled storage does not prevent toggling or retaining a choice for the visit', () => {
  const f = fixture(null, true);
  f.controller.toggle();
  assert.equal(f.root.dataset.theme, 'dark');
  f.system(false);
  assert.equal(f.controller.current, 'dark');
  f.controller.destroy();
});
test('destroy removes the system preference listener', () => {
  const f = fixture();
  f.controller.destroy();
  f.system(true);
  assert.deepEqual(f.choices, ['light']);
});
