import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const source = await readFile(new URL('./component-icons.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { getComponentAppearance } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('explicit semantic types select distinct component icons', () => {
  for (const [type, kind] of [
    ['ClassDeclaration', 'class'], ['interface', 'interface'], ['function', 'function'],
    ['method', 'method'], ['package', 'module'], ['service', 'service'],
    ['database', 'database'], ['worker', 'queue'], ['frontend', 'ui'], ['HTTPServer', 'service'],
    ['compiler', 'build'], ['validation', 'validation'], ['Sanitisation', 'security'],
    ['Pointer handling', 'interaction'], ['Viewport', 'ui'],
  ]) {
    assert.equal(getComponentAppearance({ type }).kind, kind, type);
  }
});

test('explicit type wins over path and shape hints', () => {
  assert.equal(getComponentAppearance({ type: 'Class', path: 'src/cache.test.ts', shape: 'queue' }).kind, 'class');
  assert.equal(getComponentAppearance({ type: 'Function', path: 'db/', shape: 'database' }).kind, 'function');
});

test('fallbacks use shape and path hints without guessing code symbols', () => {
  assert.equal(getComponentAppearance({ type: 'unknown', shape: 'database' }).kind, 'database');
  assert.equal(getComponentAppearance({ type: 'unknown', shape: 'queue' }).kind, 'queue');
  assert.equal(getComponentAppearance({ type: 'unknown', path: 'src/lib/' }).kind, 'folder');
  assert.equal(getComponentAppearance({ type: 'unknown', path: 'src/widget.ts' }).kind, 'file');
  assert.equal(getComponentAppearance({ type: 'unknown', path: 'src/widget.test.ts' }).kind, 'test-file');
  assert.equal(getComponentAppearance({ type: 'unknown', path: 'settings.yaml' }).kind, 'config-file');
  assert.equal(getComponentAppearance({ type: 'unknown', path: 'src/FancyClass.ts' }).kind, 'file');
  assert.equal(getComponentAppearance({ type: 'unknown', path: null, shape: null }).kind, 'component');
});

test('classification matches whole type tokens, not incidental substrings', () => {
  assert.equal(getComponentAppearance({ type: 'classifier' }).kind, 'component');
  assert.equal(getComponentAppearance({ type: 'component' }).kind, 'component');
  assert.equal(getComponentAppearance({ type: 'databaseClient' }).kind, 'database');
  assert.equal(getComponentAppearance({ type: 'class-like' }).kind, 'class');
});

test('SVG is fixed trusted markup and follows the accessible icon contract', () => {
  const expected = getComponentAppearance({ type: 'service' }).svg;
  assert.match(expected, /^<svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="16" height="16" class="component-icon" stroke="currentColor" stroke-width="1\.5" fill="none" stroke-linecap="round" stroke-linejoin="round">/);
  assert.match(expected, /<rect/);
  const malicious = getComponentAppearance({ type: '<script>alert(1)</script>', path: 'x" onload="alert(1).ts' });
  assert.equal(malicious.svg, getComponentAppearance({ type: 'unknown', path: 'file.ts' }).svg);
  assert.doesNotMatch(malicious.svg, /script|onload|alert/);
});
