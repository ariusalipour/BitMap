import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const source = await readFile(new URL('./diagram-interactions.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { installDiagramInteractions } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function fixture() {
  const view = new EventTarget();
  const stage = new EventTarget();
  const style = new Map();
  stage.ownerDocument = { defaultView: view };
  stage.style = {
    getPropertyValue: key => style.get(key) || '',
    setProperty: (key, value) => style.set(key, value),
    removeProperty: key => style.delete(key),
  };
  const cleanup = installDiagramInteractions(stage);
  function send(target, type, options = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, button: 0, clientX: 0, clientY: 0, detail: 1 }, options);
    target.dispatchEvent(event);
    return event;
  }
  function down(options = {}) {
    send(view, 'pointerdown', options);
    send(stage, 'pointerdown', options);
  }
  return { view, stage, style, cleanup, send, down };
}

test('panning across a node suppresses only its release click', () => {
  const f = fixture();
  try {
    f.down();
    f.send(f.view, 'pointermove', { clientX: 5 });
    f.send(f.view, 'pointerup', { clientX: 5 });
    assert.equal(f.send(f.stage, 'click').defaultPrevented, true);
    f.down();
    f.send(f.view, 'pointerup');
    assert.equal(f.send(f.stage, 'click').defaultPrevented, false);
  } finally { f.cleanup(); }
});

test('a release without a click does not swallow the next press or keyboard activation', () => {
  const f = fixture();
  try {
    f.down();
    f.send(f.view, 'pointerup', { clientX: 20 });
    assert.equal(f.send(f.stage, 'click', { detail: 0 }).defaultPrevented, false);
    f.down();
    f.send(f.view, 'pointerup');
    assert.equal(f.send(f.stage, 'click').defaultPrevented, false);
  } finally { f.cleanup(); }
});

test('pinch and cancelled pointers cannot activate nodes on release', () => {
  const f = fixture();
  try {
    f.down();
    f.down({ pointerId: 2 });
    f.send(f.view, 'pointerup', { pointerId: 2 });
    f.send(f.view, 'pointerup');
    assert.equal(f.send(f.stage, 'click').defaultPrevented, true);
    f.down();
    f.send(f.view, 'pointercancel');
    assert.equal(f.send(f.stage, 'click').defaultPrevented, true);
    f.down();
    f.send(f.view, 'pointerup');
    assert.equal(f.send(f.stage, 'click').defaultPrevented, false);
  } finally { f.cleanup(); }
});

test('selection and image drags are scoped to stage; context menu remains native', () => {
  const f = fixture();
  try {
    assert.equal(f.style.get('user-select'), 'none');
    assert.equal(f.send(f.stage, 'selectstart').defaultPrevented, true);
    assert.equal(f.send(f.stage, 'dragstart').defaultPrevented, true);
    assert.equal(f.send(f.view, 'selectstart').defaultPrevented, false);
    assert.equal(f.send(f.stage, 'contextmenu', { button: 2 }).defaultPrevented, false);
    f.down({ button: 2 });
    assert.equal(f.send(f.stage, 'click', { button: 2 }).defaultPrevented, false);
  } finally { f.cleanup(); }
  assert.equal(f.style.has('user-select'), false);
  assert.equal(f.send(f.stage, 'selectstart').defaultPrevented, false);
});
