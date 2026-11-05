---
archeion: 1
id: archeion
name: Archeion
ignore:
  - "fixtures/**"
  - "knowledge/**"
  - "docs/**"
  - "e2e/**"
  - "reports/**"
  - "**/test/**"
  - "**/*.test.ts"
  - "**/testGraph.ts"
---

# Archeion

Generates and explores one architecture map from reviewed knowledge and code evidence. This folder describes the tool itself, so its own map exercises the whole pipeline.

## Map

```archeion
parts:
  core:
    kind: library
    name: Core
    does: Parses knowledge, extracts supported facts, resolves, validates, and assembles the graph
    tech: TypeScript
    code: ["packages/core/**"]
    rules:
      - Core parsers accept supplied content. Disk and process I/O belong to the CLI.
    reuse:
      - Shared graph and trail contracts. Import them from @archeion/core/contracts rather than redefining shapes.
  cli:
    kind: app
    name: CLI
    does: Reads repositories, builds artifacts, and serves the viewer on loopback
    tech: Node.js 24
    code: ["packages/cli/**", "package.json"]
  viewer:
    kind: app
    name: Viewer
    does: Loads the generated graph and presents the map through four eyes
    tech: React + Three.js
    code: ["packages/viewer/**"]
    rules:
      - The viewer consumes the generated contract. Exploration never calls an LLM.
    httpTargets: { "/data": local-server, "/api": local-server, "data/": local-server, "api/": local-server }
  git-binary:
    kind: external
    name: Git
    does: Supplies revision and working-tree evidence
    tech: Installed binary
  graph-artifacts:
    kind: storage
    name: Generated artifacts
    does: graph.json and build-info.json, written atomically and kept out of committed knowledge
    tech: JSON on disk
links:
  - cli uses core
  - viewer uses contracts via browser-compatible entry
```
