# BitMap

BitMap is a local architecture and code explorer for software repositories. It automatically indexes JavaScript and TypeScript source, lets you drill into classes and functions, and renders focused relationship diagrams alongside optional, reviewed architecture maps. The browser provides component selection, relationship inspection, search, pan and zoom, and SVG and Mermaid exports.

Source analysis runs locally without executing repository code or sending repository content to a hosted service. No hosted AI generation is involved. The included authored example graph describes BitMap itself.

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
node /path/to/BitMap/cli.mjs open /path/to/repo
```

On Windows, quote paths that contain spaces, for example `node "C:\Tools\BitMap\cli.mjs" open "D:\Projects\my-project"`.

Open the printed loopback URL in your browser. The default port is 4318; use `--port 4319` when that port is occupied. The command runs in the foreground; press Ctrl+C to stop its server. Add `--no-serve` to save and validate the workspace and generate its snapshot without starting a server.

Every open indexes supported source files and refreshes the external source snapshot. No graph is required for a repository containing supported JavaScript or TypeScript source. Without an authored graph, the starting diagram shows a focused set of source modules; use **Code explorer** to search the full index and drill deeper.

To add a curated architecture map, supply `--graph`. BitMap validates and copies it into the analysed repository's `bitmap/` folder. Optional views and the title are saved there too:

```sh
node /path/to/BitMap/cli.mjs open /path/to/repo --graph /path/to/graph.json --title my-project
```

The folder is intended to be committed alongside the source so collaborators receive the same architecture description:

```text
my-project/
  bitmap/
    config.json     # Portable display settings, including the title
    graph.json      # Optional authored architecture graph
    views.json      # Optional views of that authored graph
    semantics.json  # Optional developer descriptions for indexed symbols
```

Edit those files directly, or open again with `--graph` or `--views` to import replacements. Imports are validated before saved inputs are replaced; omitted views and title retain their saved values. The original imported files are no longer needed. An existing `bitmap/graph.json` is discovered automatically and remains the curated architecture view while the source index is available separately. Paths supplied to commands are resolved from the current working directory.

When running from the BitMap checkout, the equivalent shortcut is:

```sh
npm run open -- /path/to/repo
```

You can optionally run `npm link` in the BitMap checkout to create a local `bitmap` command, then use `bitmap open /path/to/repo`. This links your local checkout; BitMap is not currently published to the npm registry.

The opener writes only portable settings and explicitly supplied authored inputs under `bitmap/` in the selected repository. A source-only open creates `bitmap/config.json`; it does not create a generated `graph.json`. It does not install packages, add hooks, or copy generated indexes, snapshots or viewer bundles into that checkout. There is no background watcher or incremental parser: reopen the repository to refresh its source index. Add `--no-analysis` to use only an authored graph and remove the workspace's cached source index. This opt-out requires an authored graph.

The authored graph format follows the vendored GitDiagram schema and currently permits up to 10 groups, 34 nodes, and 48 edges. Invalid paths or graph structure stop snapshot generation. Those limits apply to one diagram, not the complete source index; focused source diagrams show up to 30 symbols while search covers the full index.

### Explore source code

Choose **Code explorer** to browse source modules or search symbols by name, kind, source path, signature or description. Clicking a symbol selects it and shows its details without replacing the current diagram, changing its centre, clearing search, or resetting the viewport. This also works for search results outside the diagram. Use the separate **Open relationships** icon beside a symbol, or the inspector's **Open relationships** button, to navigate into it. Source-file links are separate actions. Breadcrumbs navigate through the containing symbols to the repository. The inspector exposes source lines, signatures, parameters, return types, members and documentation where available.

The explorer offers three perspectives:

| Perspective | Relationships shown |
| --- | --- |
| **Structure** | A module or symbol and its immediate children, linked by containment. |
| **Calls** | The view's centre symbol and its incoming callers/outgoing callees or JSX render relationships. Arrows point from caller to callee. Selecting another symbol does not change this centre. |
| **Dependencies** | The view's centre symbol and incoming/outgoing imports, inheritance and interface implementation. Imports connect modules. |

Diagrams stay focused instead of drawing every symbol at once. Large lists show the first 100 matches; refine search to find any symbol in the full index. A focused diagram indicates when its relationships or symbol count have been truncated. Call diagrams include only relationships touching their centre, with a persistent **View centre** marker. Repeated relationships are combined into one arrow, annotated with distinct source-line locations rather than runtime execution counts. The inspector lists incoming and outgoing calls from the full index, including relationships outside the bounded diagram.

Call edges associate source locations with their nearest indexed enclosing symbol. Anonymous callbacks are not separately indexed, so their calls may appear under the enclosing function; constructor calls currently target the class declaration. These are static source relationships, not a runtime execution trace.

The TypeScript compiler indexes modules, classes, interfaces, functions, methods, properties, type aliases and enums. JSX usage and hook naming conventions also identify components and hooks. Documentation comments supply descriptions; source declarations supply signatures, locations and supported static relationships. Local `tsconfig.json` path aliases are considered, but extended configuration, compiler plugins and external package types are not loaded. BitMap does not run the analysed repository, its configuration or its build scripts.

Resolved calls are static evidence, not a complete execution trace. Dynamic dispatch and unresolved external calls may be absent. Navigation journeys, runtime value flow, state reads/writes and transitive behavioural impact are not inferred. Swift, Kotlin and other unsupported source languages can still be represented in an authored architecture graph.

Discovery uses Git's tracked and non-ignored untracked files when available, with a bounded directory fallback outside Git. Dependency, vendor, generated, build, coverage and `bitmap/` directories, declaration files and unsafe symlinks are excluded. Defaults cap analysis at 2,000 source files, 30 MiB total and 1 MiB per source file; fallback discovery stops at 100,000 entries. The explorer reports diagnostics when discovery falls back or files are skipped, so a partial index is visible.

### Add developer descriptions

Keep team knowledge in `bitmap/semantics.json`, separate from the generated index:

```json
{
  "version": 1,
  "descriptions": {
    "s_example_symbol_id": "Explains why this class or function exists."
  }
}
```

Use a symbol ID from the local `/semantic` endpoint. IDs derive from the repository-relative path, qualified declaration name and kind; ordinary body edits preserve them, while renaming or moving declarations may change them. Reopen the repository after editing this file. Overrides are marked as developer descriptions; extracted documentation comments retain their own provenance. Overrides change descriptions, not extracted signatures, source locations or relationships.

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

Authored inputs and semantic description overrides live in the repository's `bitmap/` folder. Graph paths are relative to the repository root, and `config.json` contains no absolute checkout path. Moving or cloning the repository carries those inputs with it; reopen the new checkout to regenerate its snapshots and source index.

Generated output stays in an external cache:

| Platform | Generated cache |
| --- | --- |
| Windows | `%LOCALAPPDATA%\BitMap\Cache` |
| macOS | `~/Library/Caches/BitMap` |
| Linux | `${XDG_CACHE_HOME:-~/.cache}/bitmap` |

The Windows fallback is `~/AppData/Local/BitMap/Cache` when `LOCALAPPDATA` is unset. Each repository has a cache workspace ID derived from its canonical absolute path. Repositories with the same directory name at different locations have separate caches; reopening through a symlink resolves to the same source directory. Under the cache, `workspaces/<id>/` contains `diagram.json`, Mermaid exports and, when analysis is enabled, `semantic.json`. Deleting generated cache does not remove authored inputs; the next open regenerates it.

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

Paths are relative to the selected repository root. A node path can identify a file or directory. Evidence paths identify files that support a connection. The local source viewer serves only paths referenced in the validated graph or generated source index, with repository containment checks.

## Compare branches

Use **Compare branch** in the diagram toolbar to highlight components touched by the current branch's committed changes. Open the comparison-base picker and type to search all local and remote-tracking branches available in that checkout. Local and remote branches are identified separately, and the current local branch is marked. Use the arrow keys to navigate, Enter to select, and Escape to dismiss the picker.

**Auto** remains a shortcut for `main` (local, then `origin/main`), falling back to `master` (local, then `origin/master`). Any listed branch can be selected as the base. **Refresh** updates the branch inventory and reruns the comparison after new commits or a branch switch. The picker also reloads branches when opened. It shows loading, no-match, and retry states; if a selected branch disappears, BitMap reports it rather than silently choosing another base. Tags and symbolic aliases such as `origin/HEAD` are excluded.

The comparison uses the merge base of the selected base and `HEAD`, like a pull-request diff. It excludes staged, unstaged, and untracked changes. BitMap reads existing local Git refs; it does not fetch, switch branches, or modify source files. Update your local refs separately when you need a newer baseline. Detached HEAD is supported when a merge base can be found. Missing Git history, a missing base, or unrelated histories produce an explanatory unavailable state.

Highlights reflect paths in the current architecture graph or source explorer:

- A changed source path marks its component as **Changed**. A directory component matches files beneath that directory, with path boundaries respected.
- A changed connection evidence path marks its endpoint components as **Evidence** unless they also have direct source changes.
- Renames consider both old and new paths; added, modified, and deleted files are included. Changes without a matching component or evidence path are counted as unmapped.

Select a highlighted component to see the changed paths and the reason it matched. Highlights persist when switching views or themes and are included in SVG exports. Turning comparison off clears them without changing the diagram layout or selected component.

This is file-level change mapping, not a transitive dependency or behavioural impact analysis. Several classes declared in the same file will all match that file; nodes with no source or evidence path cannot be matched. Components absent from the current graph or index cannot be drawn, including removed components. Source analysis and authored maps remain snapshots even though the Git comparison is refreshed live.

## Snapshot behavior

BitMap is a snapshot tool. Reopen the workspace after changes to refresh source analysis; update an optional authored graph when its curated architecture changes. The snapshot records the repository commit at build time; uncommitted or unversioned supported files may also be reflected in the source index and hashes. The source viewer reads allowlisted files on demand, so files can change after indexing. A successful build validates graph structure and referenced paths, but does not establish that an authored map is complete or that static analysis captures every runtime relationship. The explicit `npm run build` command remains an authored-graph exporter; automatic source analysis runs through `open`.

## Upstream code

BitMap includes selected GitDiagram source files for graph validation and Mermaid rendering. They are pinned to commit `7876ab0ca8b5ee46e836235e23c4886d5cdb79ae`. See [`vendor/gitdiagram/README.md`](vendor/gitdiagram/README.md), [`LICENSE-GitDiagram`](LICENSE-GitDiagram), and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the fork workflow, checks, and review policy. Only [@ariusalipour](https://github.com/ariusalipour) provides the required maintainer approval and merges changes into `main`.

## License

BitMap's original code is available under the MIT License. See [`LICENSE`](LICENSE).
