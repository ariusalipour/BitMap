// Exercise comparisons against real Git histories, including paths absent from the worktree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { compareBranch, listBranches } from './branch-comparison.mjs';

const execute = promisify(execFile);
async function fixture(t, initialBranch = 'main') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bitmap-comparison-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('bitmap-comparison-'));
    await rm(root, { recursive: true, force: true });
  });
  const git = async (...args) => (await execute('git', ['-c', 'core.autocrlf=false', ...args], {
    cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, windowsHide: true,
  })).stdout.trim();
  await git('init', '-b', initialBranch);
  await git('config', 'user.name', 'BitMap Test');
  await git('config', 'user.email', 'bitmap@example.invalid');
  const write = async (name, content) => {
    const filename = path.join(root, name);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, content);
  };
  const commit = async message => { await git('add', '--all'); await git('commit', '-m', message); };
  return { root, git, write, commit };
}

test('lists all exact local and remote branches without tags or symbolic aliases', async t => {
  const { root, git, write, commit } = await fixture(t);
  await write('a.ts', 'baseline\n');
  await commit('baseline');
  const baseline = await git('rev-parse', 'HEAD');
  await git('branch', 'feature/日本語');
  await git('branch', 'origin/shared');
  await git('update-ref', 'refs/remotes/origin/shared', baseline);
  await git('update-ref', 'refs/remotes/upstream/release/v2', baseline);
  await git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/shared');
  await git('tag', 'release-tag');
  const result = await listBranches(root);
  assert.equal(result.available, true);
  assert.deepEqual(result.branches, [
    { ref: 'refs/heads/feature/日本語', name: 'feature/日本語', kind: 'local', current: false },
    { ref: 'refs/heads/main', name: 'main', kind: 'local', current: true },
    { ref: 'refs/heads/origin/shared', name: 'origin/shared', kind: 'local', current: false },
    { ref: 'refs/remotes/origin/shared', name: 'origin/shared', kind: 'remote', current: false },
    { ref: 'refs/remotes/upstream/release/v2', name: 'upstream/release/v2', kind: 'remote', current: false },
  ]);
  await git('switch', '--detach');
  assert.ok((await listBranches(root)).branches.every(branch => !branch.current));
});

test('compares arbitrary inventoried branch refs and rejects revision expressions and tags', async t => {
  const { root, git, write, commit } = await fixture(t);
  await write('a.ts', 'baseline\n');
  await commit('baseline');
  const baseline = await git('rev-parse', 'HEAD');
  await git('branch', 'release/日本語');
  await git('update-ref', 'refs/remotes/upstream/release/v2', baseline);
  await git('tag', 'release-tag');
  await git('switch', '-c', 'feature');
  await write('a.ts', 'changed\n');
  await commit('feature');
  const graph = { nodes: [{ id: 'a', path: 'a.ts' }], edges: [] };
  for (const ref of ['refs/heads/release/日本語', 'refs/remotes/upstream/release/v2']) {
    const result = await compareBranch(root, graph, ref);
    assert.equal(result.available, true);
    assert.equal(result.baseRef, ref);
    assert.equal(result.baseCommit, baseline);
    assert.equal(result.nodes[0].id, 'a');
  }
  for (const invalid of ['feature', '--help', '--output=bad', 'HEAD', 'HEAD~1', 'refs/heads/main^{commit}', 'refs/heads/main..HEAD', 'refs/tags/release-tag', 'refs/heads/missing', '', null]) {
    await assert.rejects(compareBranch(root, graph, invalid), error => error.code === 'INVALID_BASE');
  }
  await git('branch', '-D', 'release/日本語');
  await assert.rejects(compareBranch(root, graph, 'refs/heads/release/日本語'), error => error.code === 'INVALID_BASE');
});

test('maps committed changes to source paths, directory boundaries and relationship evidence', async t => {
  const { root, git, write, commit } = await fixture(t);
  for (const name of ['src/changed.ts', 'src2/other.ts', 'edges/link.ts', 'untouched.ts', 'dirty.ts']) await write(name, 'original\n');
  await commit('baseline');
  const baseCommit = await git('rev-parse', 'HEAD');
  await git('switch', '-c', 'feature');
  for (const name of ['src/changed.ts', 'src2/other.ts', 'edges/link.ts', 'unmapped.ts']) await write(name, 'branch change\n');
  await commit('feature');
  const headCommit = await git('rev-parse', 'HEAD');
  // The base has moved independently: comparison uses the common ancestor, not a two-dot diff.
  await git('switch', 'main');
  await write('main-only.ts', 'base advanced\n');
  await commit('advance main');
  await git('switch', 'feature');
  await write('dirty.ts', 'uncommitted\n');
  await write('untracked.ts', 'untracked\n');
  const before = await git('status', '--porcelain');
  const graph = {
    nodes: [{ id: 'source', path: 'src/changed.ts' }, { id: 'directory', path: 'src' }, { id: 'boundary', path: 'src2' }, { id: 'other', path: 'untouched.ts' }, { id: 'dirty', path: 'dirty.ts' }],
    edges: [{ from: 'source', to: 'other', evidencePath: 'edges' }, { from: 'source', to: 'other', evidencePath: 'edges' }],
  };
  const result = await compareBranch(root, graph);
  assert.equal(result.available, true);
  assert.equal(result.base, 'main');
  assert.equal(result.branch, 'feature');
  assert.equal(result.scope, 'committed');
  assert.equal(result.mergeBase, baseCommit);
  assert.equal(result.headCommit, headCommit);
  assert.notEqual(result.baseCommit, baseCommit);
  assert.deepEqual(result.files.map(file => file.path), ['edges/link.ts', 'src/changed.ts', 'src2/other.ts', 'unmapped.ts']);
  assert.deepEqual(result.nodes.map(node => node.id), ['source', 'directory', 'boundary', 'other']);
  assert.deepEqual(result.nodes.find(node => node.id === 'directory').reasons.map(reason => reason.path), ['src/changed.ts']);
  assert.equal(result.nodes.find(node => node.id === 'other').reasons.length, 1);
  assert.equal(result.nodes.find(node => node.id === 'other').reasons[0].kind, 'evidence');
  assert.deepEqual(result.unmappedFiles, [{ status: 'A', path: 'unmapped.ts' }]);
  assert.equal(await git('status', '--porcelain'), before);
});

test('tracks renamed old and new paths, deleted paths, spaces and Unicode', async t => {
  const { root, git, write, commit } = await fixture(t);
  await write('old folder/日本語 file.ts', 'A substantial unique rename body\n'.repeat(20));
  await write('deleted file.ts', 'deleted\n');
  await commit('baseline');
  await git('switch', '-c', 'feature');
  await mkdir(path.join(root, 'new folder'));
  await git('mv', 'old folder/日本語 file.ts', 'new folder/日本語 file.ts');
  await git('rm', 'deleted file.ts');
  await commit('rename and delete');
  const result = await compareBranch(root, { nodes: [
    { id: 'old', path: 'old folder/日本語 file.ts' },
    { id: 'new', path: 'new folder' },
    { id: 'deleted', path: 'deleted file.ts' },
  ], edges: [] });
  assert.equal(result.available, true);
  assert.deepEqual(result.nodes.map(node => node.id), ['old', 'new', 'deleted']);
  assert.ok(result.files.some(file => file.status === 'R100' && file.oldPath === 'old folder/日本語 file.ts' && file.path === 'new folder/日本語 file.ts'));
  assert.ok(result.files.some(file => file.status === 'D' && file.path === 'deleted file.ts'));
  assert.deepEqual(result.unmappedFiles, []);
});

test('selects master or locally available origin refs and supports detached HEAD', async t => {
  const { root, git, write, commit } = await fixture(t, 'master');
  await write('a.ts', 'baseline\n');
  await commit('baseline');
  const base = await git('rev-parse', 'HEAD');
  await git('switch', '-c', 'feature');
  await write('a.ts', 'changed\n');
  await commit('feature');
  const graph = { nodes: [{ id: 'a', path: 'a.ts' }], edges: [] };
  assert.equal((await compareBranch(root, graph)).base, 'master');
  await git('update-ref', 'refs/remotes/origin/main', base);
  assert.equal((await compareBranch(root, graph)).base, 'origin/main');
  assert.equal((await compareBranch(root, graph, 'main')).base, 'origin/main');
  assert.equal((await compareBranch(root, graph, 'master')).base, 'master');
  await git('switch', '--detach');
  const detached = await compareBranch(root, graph);
  assert.equal(detached.available, true);
  assert.equal(detached.branch, 'Detached HEAD');
  assert.equal(detached.nodes[0].id, 'a');
  await git('branch', 'main', base);
  assert.equal((await compareBranch(root, graph)).base, 'main');
});

test('reports missing bases and histories without making Git changes', async t => {
  const { root, git, write, commit } = await fixture(t, 'trunk');
  assert.equal((await compareBranch(root, { nodes: [] })).available, false);
  await write('a.ts', 'initial\n');
  await commit('baseline');
  const result = await compareBranch(root, { nodes: [] });
  assert.equal(result.available, false);
  assert.match(result.message, /No main or master/);
  assert.equal(await git('branch', '--show-current'), 'trunk');
  await assert.rejects(compareBranch(root, {}, '--help'), /base must be/);
});

test('reports unrelated branch history and an empty comparison on the base', async t => {
  const { root, git, write, commit } = await fixture(t);
  await write('main.ts', 'main\n');
  await commit('main');
  const empty = await compareBranch(root, { nodes: [] });
  assert.equal(empty.available, true);
  assert.deepEqual(empty.files, []);
  await git('switch', '--orphan', 'unrelated');
  await write('other.ts', 'other\n');
  await commit('unrelated');
  const result = await compareBranch(root, { nodes: [] });
  assert.equal(result.available, false);
  assert.match(result.message, /no common ancestor/);
});
