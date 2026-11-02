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

The first open validates and copies your authored graph into the analysed repository's `bitmap/` folder. Optional views and the title are saved there too. If the repository already contains `bitmap/graph.json`, no `--graph` argument is needed:

```sh
node /path/to/BitMap/cli.mjs open /path/to/repo
```

The folder is intended to be committed alongside the source so collaborators receive the same architecture description:

```text
my-project/
  bitmap/
    graph.json     # Authored architecture graph
    views.json     # Optional named views
    config.json    # Portable display settings, including the title
```

Edit those files directly, or open again with `--graph` or `--views` to import replacements. Imports are validated before saved inputs are replaced; omitted views and title retain their saved values. The original imported files are no longer needed. Paths supplied to commands are resolved from the current working directory.

When running from the BitMap checkout, the equivalent shortcut is:

```sh
npm run open -- /path/to/repo --graph /path/to/graph.json
```

You can optionally run `npm link` in the BitMap checkout to create a local `bitmap` command, then use `bitmap open /path/to/repo`. This links your local checkout; BitMap is not currently published to the npm registry.

The opener writes only the small authored graph, views, and settings files under `bitmap/` in the selected repository. It does not install packages, add hooks, or copy generated snapshots or viewer bundles into that checkout. It does not automatically analyze source code: provide an initial `--graph` or an existing `bitmap/graph.json`. Each open rebuilds the snapshot from the saved graph, validates its referenced paths, and computes reviewed-file hashes. There is no background watcher or incremental source parser.

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

Authored inputs live in the repository's `bitmap/` folder. Graph paths are relative to the repository root, and `config.json` contains no absolute checkout path. Moving or cloning the repository carries those inputs with it; reopen the new checkout to regenerate its snapshot.

Generated output stays in an external cache:

| Platform | Generated cache |
| --- | --- |
| Windows | `%LOCALAPPDATA%\BitMap\Cache` |
| macOS | `~/Library/Caches/BitMap` |
| Linux | `${XDG_CACHE_HOME:-~/.cache}/bitmap` |

The Windows fallback is `~/AppData/Local/BitMap/Cache` when `LOCALAPPDATA` is unset. Each repository has a cache workspace ID derived from its canonical absolute path. Repositories with the same directory name at different locations have separate caches; reopening through a symlink resolves to the same source directory. Under the cache, `workspaces/<id>/` contains `diagram.json` and Mermaid exports. Deleting generated cache does not remove authored inputs; the next open regenerates it.

Set `BITMAP_CACHE_DIR` to choose a different cache root. Cache storage inside the selected repository is rejected, including paths that resolve there through symlinks. Generated snapshots must remain outside the authored `bitmap/` folder.

For workspaces created by the earlier external-storage workflow, the next open migrates their graph, optional views, and title into `bitmap/` if there is no repository-local graph. Existing local inputs take precedence, and the old external files are retained as backups. `BITMAP_DATA_DIR` is now used only to locate those legacy inputs during migration. Its defaults are `%LOCALAPPDATA%\BitMap` on Windows, `~/Library/Application Support/BitMap` on macOS, and `${XDG_DATA_HOME:-~/.local/share}/bitmap` on Linux. If you previously used a custom data root, keep that override for the migration open.

The compiler and browser assets are shared by all workspaces in the BitMap checkout's `dist/runtime/`. A fingerprint of their build inputs lets unchanged assets be reused. Opening or refreshing another repository does not duplicate the viewer or Mermaid bundles in its workspace cache. Changes to the runtime's source or build inputs trigger a rebuild.

Review `bitmap/` before committing it: authored graphs and views can contain private architecture descriptions. Generated snapshots also contain absolute source locations, repository commit information, and hashes of reviewed files. Keep caches private and review exports before sharing them.

### Explicit builds and exports

The original build command remains available for the bundled example and for a self-contained output directory:

```sh
npm run build -- --root /path/to/repo --graph /path/to/graph.json --title my-project --views /path/to/views.json --out /path/to/output
```

Unlike `open`, this explicit build copies browser assets into its output directory. It defaults to `dist/` in the BitMap checkout and does not register a workspace. Keep private graph inputs and output outside the public checkout, or use the ignored `local/` directory for local experiments. Do not select the analyzed repository as an output directory if you want it to remain free of generated files.

## Graph shape

The input is a JSON object with `groups`, `nodes`, and `edges` arrays. Each node has an ID, label, type, nullable description, nullable group ID, nullable repository-relative path, and nullable shape. Each edge has `from`, `to`, nullable label and description, nullable style, and an optional nullable evidence path. See `examples/bitmap.graph.json` for a complete working example; the vendored upstream schema defines field validation and limits.

Paths are relative to the selected repository root. A node path can identify a file or directory. Evidence paths identify files that support a connection. The local viewer serves only paths referenced in the validated graph.

## Compare a branch with main or master

Use **Compare branch** in the diagram toolbar to highlight components touched by the current branch's committed changes. **Auto** selects `main` (local, then `origin/main`), falling back to `master` (local, then `origin/master`). You can select **main** or **master** explicitly. **Refresh** reruns the comparison after new commits or a branch switch.

The comparison uses the merge base of the selected base and `HEAD`, like a pull-request diff. It excludes staged, unstaged, and untracked changes. BitMap reads existing local Git refs; it does not fetch, switch branches, or modify source files. Update your local refs separately when you need a newer baseline. Detached HEAD is supported when a merge base can be found. Missing Git history, a missing base, or unrelated histories produce an explanatory unavailable state.

Highlights reflect the paths in the current authored graph:

- A changed source path marks its component as **Changed**. A directory component matches files beneath that directory, with path boundaries respected.
- A changed connection evidence path marks its endpoint components as **Evidence** unless they also have direct source changes.
- Renames consider both old and new paths; added, modified, and deleted files are included. Changes without a matching component or evidence path are counted as unmapped.

Select a highlighted component to see the changed paths and the reason it matched. Highlights persist when switching views or themes and are included in SVG exports. Turning comparison off clears them without changing the diagram layout or selected component.

This is file-level change mapping, not a transitive dependency or behavioural impact analysis. Several classes declared in the same file will all match that file; nodes with no source or evidence path cannot be matched. Components absent from the current graph cannot be drawn, including components removed from that graph. The authored graph remains a snapshot even though the Git comparison is refreshed live.

## Snapshot behavior

BitMap is a static snapshot tool. Reopen the workspace after reviewing changes to the repository; supply an updated graph with `--graph` when its architecture changes. The snapshot records the repository commit at build time; uncommitted or unversioned referenced files may also be reflected in the rendered graph and its hashes. A successful build validates graph structure and referenced paths, but does not establish that the graph is a complete or current description of the software.

## Upstream code

BitMap includes selected GitDiagram source files for graph validation and Mermaid rendering. They are pinned to commit `7876ab0ca8b5ee46e836235e23c4886d5cdb79ae`. See [`vendor/gitdiagram/README.md`](vendor/gitdiagram/README.md), [`LICENSE-GitDiagram`](LICENSE-GitDiagram), and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the fork workflow, checks, and review policy. Only [@ariusalipour](https://github.com/ariusalipour) provides the required maintainer approval and merges changes into `main`.

## License

BitMap's original code is available under the MIT License. See [`LICENSE`](LICENSE).
