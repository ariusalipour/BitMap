# BitMap

BitMap is a local architecture explorer for software repositories. It renders a reviewed component graph in a browser and provides component selection, relationship inspection, search, pan and zoom, and SVG and Mermaid exports.

BitMap validates and renders a graph you provide. It does not analyze source code automatically, generate diagrams with AI, or send repository content to a hosted service. The included example graph describes BitMap itself.

Component icons in the navigator, details, and connection lists reflect each node's declared type: classes, interfaces, functions, methods, modules, services, databases, queues, UI views, build pipelines, and security components. Shape and source-path hints provide conservative fallbacks for generic nodes. A source filename alone never identifies a class or function. Hover a component to see its icon category and declared type; assistive technology also receives the category.

Use the moon/sun button in the header to switch between light and dark mode. BitMap follows the system preference until you choose a theme, then remembers your choice in this browser. Changing theme preserves the current view, selection, pan and zoom. SVG exports retain the active diagram palette.

## Requirements

- Node.js 20 or newer
- npm

## Run the example

From the repository directory:

```sh
npm ci
npm run build
npm start
```

Open [http://127.0.0.1:4318](http://127.0.0.1:4318). The server listens on loopback. The build creates local files under `dist/`; those generated files are excluded from version control because they may contain repository-specific architecture data.

Run the integration tests with:

```sh
npm test
```

The test command starts and stops its own local server.

## Open another repository

Install BitMap's dependencies once in the BitMap checkout with `npm ci`. Use the standalone opener from any working directory:

```sh
node /path/to/BitMap/cli.mjs open /path/to/repo --graph /path/to/graph.json --title my-project
```

On Windows, quote paths that contain spaces, for example `node "C:\Tools\BitMap\cli.mjs" open "D:\Projects\my-project" --graph "D:\Maps\my-project.graph.json"`.

Open the printed loopback URL in your browser. The default port is 4318; use `--port 4319` when that port is occupied. The command runs in the foreground; press Ctrl+C to stop its server. Add `--no-serve` to save and validate the workspace and generate its snapshot without starting a server.

The first open copies your authored graph, optional views, and title into BitMap's application data. Subsequent opens reuse those saved inputs:

```sh
node /path/to/BitMap/cli.mjs open /path/to/repo
```

The original input files are no longer needed to reopen that workspace. To update the saved graph or views, open again with `--graph` or `--views`; omitted views and title retain their saved values. Paths supplied to commands are resolved from the current working directory.

When running from the BitMap checkout, the equivalent shortcut is:

```sh
npm run open -- /path/to/repo --graph /path/to/graph.json
```

You can optionally run `npm link` in the BitMap checkout to create a local `bitmap` command, then use `bitmap open /path/to/repo`. This links your local checkout; BitMap is not currently published to the npm registry.

The opener reads the selected repository without installing packages, adding configuration or hooks, or writing generated files there. It does not automatically analyze source code: an initial `--graph` is required. Each open rebuilds the snapshot from the saved graph, validates its referenced paths, and computes reviewed-file hashes. There is no background watcher or incremental source parser.

The graph format follows the vendored GitDiagram schema and currently permits up to 10 groups, 34 nodes, and 48 edges. Invalid paths or graph structure stop snapshot generation.

### Additional views

Pass a views JSON file on the initial open or a later update:

```sh
node /path/to/BitMap/cli.mjs open /path/to/repo --graph /path/to/graph.json --views /path/to/views.json --title my-project
```

The views file is an array of objects with `id`, `label`, and `nodeIds` fields. For example:

```json
[
  { "id": "runtime", "label": "Runtime", "nodeIds": ["web_app", "database"] }
]
```

The complete graph view is always included. Without a views file, an overview containing all graph nodes is used. Each configured view is validated against the graph.

### Storage and reuse

Each repository has a workspace ID derived from its canonical absolute path. Repositories with the same directory name at different locations have separate workspaces; reopening through a symlink resolves to the same source directory. Moving a checkout to a different canonical path creates a separate workspace, which needs its graph supplied again.

BitMap keeps durable inputs and disposable generated output separately:

| Platform | Application data | Generated cache |
| --- | --- | --- |
| Windows | `%LOCALAPPDATA%\BitMap` | `%LOCALAPPDATA%\BitMap\Cache` |
| macOS | `~/Library/Application Support/BitMap` | `~/Library/Caches/BitMap` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/bitmap` | `${XDG_CACHE_HOME:-~/.cache}/bitmap` |

The Windows application-data fallback is `~/AppData/Local/BitMap` when `LOCALAPPDATA` is unset. Under application data, `workspaces/<id>/` contains the saved `graph.json`, optional `views.json`, and `config.json`. Under the cache, `workspaces/<id>/` contains `diagram.json` and Mermaid exports. Deleting generated cache does not remove the authored inputs; the next open regenerates it. Keep the application data if you want to retain those inputs and workspace settings.

Set `BITMAP_DATA_DIR` and/or `BITMAP_CACHE_DIR` to choose different storage roots. Continue using the same overrides on future opens to find the same workspaces. Overrides do not migrate existing storage. Storage inside the selected repository is rejected, including paths that resolve there through symlinks. The durable data directory must also remain outside the cache directory so clearing the cache cannot erase saved inputs.

The compiler and browser assets are shared by all workspaces in the BitMap checkout's `dist/runtime/`. A fingerprint of their build inputs lets unchanged assets be reused. Opening or refreshing another repository does not duplicate the viewer or Mermaid bundles in its workspace cache. Changes to the runtime's source or build inputs trigger a rebuild.

Saved inputs and generated snapshots can include private architecture descriptions, absolute source locations, repository commit information, and hashes of reviewed files. Keep their storage private and review exports before sharing them.

### Explicit builds and exports

The original build command remains available for the bundled example and for a self-contained output directory:

```sh
npm run build -- --root /path/to/repo --graph /path/to/graph.json --title my-project --views /path/to/views.json --out /path/to/output
```

Unlike `open`, this explicit build copies browser assets into its output directory. It defaults to `dist/` in the BitMap checkout and does not register a workspace. Keep private graph inputs and output outside the public checkout, or use the ignored `local/` directory for local experiments. Do not select the analyzed repository as an output directory if you want it to remain free of generated files.

## Graph shape

The input is a JSON object with `groups`, `nodes`, and `edges` arrays. Each node has an ID, label, type, nullable description, nullable group ID, nullable repository-relative path, and nullable shape. Each edge has `from`, `to`, nullable label and description, nullable style, and an optional nullable evidence path. See `examples/bitmap.graph.json` for a complete working example; the vendored upstream schema defines field validation and limits.

Paths are relative to the selected repository root. A node path can identify a file or directory. Evidence paths identify files that support a connection. The local viewer serves only paths referenced in the validated graph.

## Snapshot behavior

BitMap is a static snapshot tool. Reopen the workspace after reviewing changes to the repository; supply an updated graph with `--graph` when its architecture changes. The snapshot records the repository commit at build time; uncommitted or unversioned referenced files may also be reflected in the rendered graph and its hashes. A successful build validates graph structure and referenced paths, but does not establish that the graph is a complete or current description of the software.

## Upstream code

BitMap includes selected GitDiagram source files for graph validation and Mermaid rendering. They are pinned to commit `7876ab0ca8b5ee46e836235e23c4886d5cdb79ae`. See [`vendor/gitdiagram/README.md`](vendor/gitdiagram/README.md), [`LICENSE-GitDiagram`](LICENSE-GitDiagram), and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the fork workflow, checks, and review policy. Only [@ariusalipour](https://github.com/ariusalipour) provides the required maintainer approval and merges changes into `main`.

## License

BitMap's original code is available under the MIT License. See [`LICENSE`](LICENSE).
