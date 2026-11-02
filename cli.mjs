#!/usr/bin/env node
// Open repository-owned bitmap inputs with shared tooling and an external cache.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { realpath, rm } from 'node:fs/promises';
import { prepareWorkspace } from './workspaces.mjs';
import { ensureRuntime } from './runtime.mjs';
import { buildSnapshot } from './snapshot.mjs';
import { createAppServer } from './server.mjs';
import { buildSemanticWorkspace } from './semantic-workspace.mjs';

const usage = 'Usage: bitmap open <repository> [--graph graph.json] [--views views.json] [--title name] [--port 4318] [--no-serve] [--no-analysis]';
export function parseArguments(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  if (args[0] !== 'open' || !args[1] || args[1].startsWith('--')) throw Error(usage);
  const options = { root: args[1], port: 4318 };
  const seen = new Set();
  for (let i = 2; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw Error('Duplicate option: ' + flag);
    seen.add(flag);
    if (flag === '--no-serve') { options.noServe = true; continue; }
    if (flag === '--no-analysis') { options.noAnalysis = true; continue; }
    if (!['--graph', '--views', '--title', '--port'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error(usage);
    options[flag.slice(2)] = args[++i];
  }
  options.port = Number(options.port);
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw Error('Port must be an integer between 1 and 65535');
  return options;
}

export async function openRepository(options) {
  const runtime = await ensureRuntime();
  const workspace = await prepareWorkspace({ ...options, allowMissingGraph:!options.noAnalysis,
    validate: async candidate => {
      if (candidate.graph) await buildSnapshot({ ...candidate, runtime });
      if (!options.noAnalysis) await buildSemanticWorkspace({...candidate,authored:Boolean(candidate.graph)});
      else await rm(path.join(candidate.out,'semantic.json'),{force:true});
    },
  });
  if (options.noServe) return { workspace, runtime };
  const server = await createAppServer(workspace.out, runtime);
  server.listen(options.port ?? 4318, '127.0.0.1');
  try { await once(server, 'listening'); }
  catch (error) {
    if (error.code === 'EADDRINUSE') throw Error(`Port ${options.port ?? 4318} is already in use. Choose another with --port.`);
    throw error;
  }
  return { workspace, runtime, server };
}

if (process.argv[1] && await realpath(path.resolve(process.argv[1])).catch(() => '') === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) console.log(usage);
    else {
      const { workspace, server } = await openRepository(options);
      console.log(`Graph: ${workspace.graph || 'Source analysis (external cache)'}\nWorkspace: ${workspace.id}\nSnapshot: ${workspace.out}`);
      if (server) {
        console.log(`BitMap: http://127.0.0.1:${server.address().port}\nPress Ctrl+C to stop.`);
        for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
      }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
