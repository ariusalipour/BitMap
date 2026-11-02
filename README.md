# BitMap

BitMap is a local architecture explorer for software repositories. It renders a reviewed component graph in a browser and provides component selection, relationship inspection, search, pan and zoom, and SVG and Mermaid exports.

BitMap validates and renders a graph you provide. It does not analyze source code automatically, generate diagrams with AI, or send repository content to a hosted service. The included example graph describes BitMap itself.

Component icons in the navigator, details, and connection lists reflect each node's declared type: classes, interfaces, functions, methods, modules, services, databases, queues, UI views, build pipelines, and security components. Shape and source-path hints provide conservative fallbacks for generic nodes. A source filename alone never identifies a class or function. Hover a component to see its icon category and declared type; assistive technology also receives the category.

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

## Build a graph for another repository

The default build uses this repository as its source root and `examples/bitmap.graph.json` as its graph input. To use another checkout and graph, pass options after `--`:

```sh
npm run build -- --root /path/to/repo --graph /path/to/graph.json --title my-project
```

Paths are resolved from the current working directory. Keep private graph inputs outside this repository or under the ignored local `local/` directory. Generated `dist/` files can include graph descriptions, source paths, repository commit information, and hashes of reviewed files. Review generated output before sharing it.

The graph format follows the vendored GitDiagram schema and currently permits up to 10 groups, 34 nodes, and 48 edges. Referenced node and evidence paths are checked against the selected root. Invalid paths or graph structure stop the build.

You can optionally define additional views by passing a JSON file:

```sh
npm run build -- --root /path/to/repo --graph /path/to/graph.json --title my-project --views /path/to/views.json
```

The views file is an array of objects with `id`, `label`, and `nodeIds` fields. For example:

```json
[
  { "id": "runtime", "label": "Runtime", "nodeIds": ["web_app", "database"] }
]
```

The complete graph view is always included. Without a views file, an overview containing all graph nodes is used. Each configured view is validated against the graph.

## Graph shape

The input is a JSON object with `groups`, `nodes`, and `edges` arrays. Each node has an ID, label, type, nullable description, nullable group ID, nullable repository-relative path, and nullable shape. Each edge has `from`, `to`, nullable label and description, nullable style, and an optional nullable evidence path. See `examples/bitmap.graph.json` for a complete working example; the vendored upstream schema defines field validation and limits.

Paths are relative to the selected repository root. A node path can identify a file or directory. Evidence paths identify files that support a connection. The local viewer serves only paths referenced in the validated graph.

## Snapshot behavior

BitMap is a static snapshot tool. Rebuild after reviewing changes to the repository and its graph. The snapshot records the repository commit at build time; uncommitted or unversioned referenced files may also be reflected in the rendered graph and its hashes. A successful build validates graph structure and referenced paths, but does not establish that the graph is a complete or current description of the software.

## Upstream code

BitMap includes selected GitDiagram source files for graph validation and Mermaid rendering. They are pinned to commit `7876ab0ca8b5ee46e836235e23c4886d5cdb79ae`. See [`vendor/gitdiagram/README.md`](vendor/gitdiagram/README.md), [`LICENSE-GitDiagram`](LICENSE-GitDiagram), and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## License

BitMap's original code is available under the MIT License. See [`LICENSE`](LICENSE).
