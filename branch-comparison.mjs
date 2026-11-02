// Compare committed branch changes against locally available branch history without modifying Git state.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

async function git(root, args) {
  const { stdout } = await execute('git', args, {
    cwd: root,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

function gitFailure(error, action) {
  if (error.code === 'ENOENT') return { available: false, message: 'Git is not installed or cannot be found on PATH.' };
  if (error.killed || error.code === 'ETIMEDOUT') return { available: false, message: `The Git ${action} timed out. Try again after repository operations finish.` };
  if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return { available: false, message: `The Git ${action} exceeds the size limit.` };
  return { available: false, message: `Unable to ${action} this repository. It must have a committed Git history.` };
}

/** Enumerate exact local and remote-tracking refs, excluding symbolic remote HEAD aliases. */
export async function listBranches(root) {
  try {
    const output = await git(root, ['for-each-ref', '--format=%(refname)%00%(symref)%00%(HEAD)', 'refs/heads', 'refs/remotes']);
    const branches = output.split('\n').filter(Boolean).flatMap(line => {
      const [ref, symref, head] = line.split('\0');
      if (symref) return [];
      const kind = ref.startsWith('refs/heads/') ? 'local' : 'remote';
      return [{ ref, name: ref.slice(kind === 'local' ? 'refs/heads/'.length : 'refs/remotes/'.length), kind, current: head?.trim() === '*' }];
    });
    return { available: true, branches };
  } catch (error) {
    return gitFailure(error, 'list branches in');
  }
}

function invalidBase() {
  const error = new Error('Comparison base must be auto, main, master, or an exact available branch reference.');
  error.code = 'INVALID_BASE';
  return error;
}

function parseFiles(output) {
  const fields = output.split('\0');
  const files = [];
  for (let index = 0; index < fields.length && fields[index];) {
    const status = fields[index++];
    const firstPath = fields[index++];
    if (!firstPath) throw new Error('Git returned an incomplete changed-file record.');
    if (/^[RC]\d*$/.test(status)) {
      const nextPath = fields[index++];
      if (!nextPath) throw new Error('Git returned an incomplete rename record.');
      files.push({ status, path: nextPath, oldPath: firstPath });
    } else {
      files.push({ status, path: firstPath });
    }
  }
  return files;
}

function matches(graphPath, file) {
  if (typeof graphPath !== 'string' || !graphPath) return false;
  const prefix = graphPath.replace(/\/+$/, '');
  return [file.path, file.oldPath].some(value => value && (value === prefix || value.startsWith(`${prefix}/`)));
}

/** Map changed source paths and changed relationship evidence onto the authored graph. */
export async function compareBranch(root, graph, requestedBase = 'auto') {
  if (typeof requestedBase !== 'string') throw invalidBase();
  const inventory = await listBranches(root);
  const legacy = ['auto', 'main', 'master'].includes(requestedBase);
  if (!legacy && (!inventory.available || !inventory.branches.some(branch => branch.ref === requestedBase))) throw invalidBase();
  if (!inventory.available) return inventory;
  try {
    const headCommit = (await git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
    const branchName = (await git(root, ['branch', '--show-current'])).trim();
    const candidates = legacy
      ? (requestedBase === 'auto' ? ['main', 'master'] : [requestedBase]).flatMap(name => [`refs/heads/${name}`, `refs/remotes/origin/${name}`])
      : [requestedBase];
    const selected = candidates.map(ref => inventory.branches.find(branch => branch.ref === ref)).find(Boolean);
    if (!selected) return { available: false, message: `No ${requestedBase === 'auto' ? 'main or master' : requestedBase} branch is available locally. Fetch it outside BitMap and try again.` };
    const base = selected.name;
    const baseCommit = (await git(root, ['rev-parse', '--verify', `${selected.ref}^{commit}`])).trim();
    let mergeBase;
    try {
      mergeBase = (await git(root, ['merge-base', baseCommit, headCommit])).trim();
    } catch (error) {
      if (error.code === 1) return { available: false, message: `The current commit and ${base} have no common ancestor.` };
      throw error;
    }
    const files = parseFiles(await git(root, ['diff', '--name-status', '-z', '--find-renames', '--no-ext-diff', '--no-textconv', mergeBase, headCommit, '--']));
    const affected = new Map();
    const mappedFiles = new Set();
    const nodeIds = new Set((graph.nodes ?? []).map(node => node.id));
    const add = (id, kind, file) => {
      if (!nodeIds.has(id)) return;
      const reasons = affected.get(id) ?? [];
      if (!reasons.some(reason => reason.kind === kind && reason.path === file.path && reason.oldPath === file.oldPath && reason.status === file.status)) {
        reasons.push({ kind, ...file });
      }
      affected.set(id, reasons);
      mappedFiles.add(file);
    };
    for (const file of files) {
      for (const node of graph.nodes ?? []) {
        if (matches(node.path, file)) add(node.id, 'source', file);
      }
      for (const edge of graph.edges ?? []) {
        if (matches(edge.evidencePath, file)) {
          add(edge.from, 'evidence', file);
          add(edge.to, 'evidence', file);
        }
      }
    }
    return {
      available: true,
      branch: branchName || 'Detached HEAD',
      base, baseRef: selected.ref, baseCommit, headCommit, mergeBase, files,
      nodes: (graph.nodes ?? []).filter(node => affected.has(node.id)).map(node => ({ id: node.id, reasons: affected.get(node.id) })),
      unmappedFiles: files.filter(file => !mappedFiles.has(file)),
      scope: 'committed',
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { available: false, message: 'Git is not installed or cannot be found on PATH.' };
    if (error.killed || error.code === 'ETIMEDOUT') return { available: false, message: 'The Git comparison timed out. Try again after repository operations finish.' };
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return { available: false, message: 'The changed-file list exceeds the comparison size limit.' };
    return { available: false, message: 'Unable to compare this repository. It must have a committed Git history and an accessible selected branch.' };
  }
}
