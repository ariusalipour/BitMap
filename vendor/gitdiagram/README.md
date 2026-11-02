# Vendored GitDiagram source

This directory contains selected pure source files from [GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram), pinned to upstream commit `7876ab0ca8b5ee46e836235e23c4886d5cdb79ae`.

The subset supplies graph schema and validation, Mermaid compilation and rendering configuration, Mermaid source and SVG sanitization, viewport behavior, and small related helpers. Four vendored files are unchanged from the pinned upstream revision: `src/components/mermaid-diagram-helpers.ts`, `src/features/diagram/mermaid-config.ts`, `src/features/diagram/mermaid-security.ts`, and `src/mcp-app/viewport.ts`.

Two files contain narrow changes for this local-only use:

- `src/features/diagram/graph.ts` removes the hosted-generation audit type interfaces and their cost type import. Graph schema and validation behavior are retained.
- `src/server/generate/graph.ts` defines the `RepositoryPathType` union (`"blob" | "tree"`) locally instead of importing a hosted GitHub type. This keeps the compiler independent of the upstream hosted application.

The subset does not include GitDiagram's hosted application, AI generation pipeline, or cloud services. BitMap uses these files locally to validate and render a graph supplied by the user.

The upstream project is distributed under the MIT License. Its license text is retained at the repository root as [`LICENSE-GitDiagram`](../../LICENSE-GitDiagram). Keep that notice with redistributed copies of the vendored source.

Upstream source repository: <https://github.com/ahmedkhaleel2004/gitdiagram>
