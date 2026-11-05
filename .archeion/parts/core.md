---
id: core
---

# Core

Everything that turns supplied inputs into one deterministic graph. It reads no files and starts no processes.

## Map

```archeion
parts:
  contracts:
    kind: module
    name: Contracts
    does: Zod schemas for the graph and trails, shared with the viewer and exported as JSON Schema
    code: ["packages/core/src/contracts.ts", "packages/core/schema/**", "packages/core/scripts/**"]
    tech: Zod 4
    reuse:
      - Validate or type any artifact shape from here.
  knowledge-reader:
    kind: module
    name: Knowledge reader
    does: Parses Markdown and YAML knowledge into declarations, with positioned diagnostics
    code: ["packages/core/src/knowledge.ts"]
    tech: unified + yaml
  extractors:
    kind: module
    name: Extractors
    does: Reads supported C#, TS/TSX, OpenAPI, ARM, configuration, and manifest facts
    code: ["packages/core/src/extract/**", "packages/core/grammars/**"]
    tech: web-tree-sitter
  assembler:
    kind: module
    name: Assembler
    does: Resolves identity and evidence into connections and flows, then validates the graph
    code: ["packages/core/src/build.ts", "packages/core/src/index.ts"]
  comparison:
    kind: module
    name: Comparison
    does: Turns supplied Git facts into per-repo baselines, changed parts, and dependency swaps
    code: ["packages/core/src/compare.ts"]
links:
  - assembler uses knowledge-reader
  - assembler uses extractors
  - assembler uses comparison
  - assembler uses contracts
  - comparison uses knowledge-reader
```
