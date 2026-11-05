---
id: cli
---

# CLI

Owns the disk and the processes, so the core stays pure.

## Map

```archeion
parts:
  commands:
    kind: module
    name: Commands
    does: The init, check, build, view, and import-trail commands
    code: ["packages/cli/src/cli.ts"]
    tech: commander
  build-pipeline:
    kind: module
    name: Build pipeline
    does: Collects workspace inputs, runs the core, and writes artifacts atomically
    code: ["packages/cli/src/pipeline.ts"]
  git-evidence:
    kind: module
    name: Git evidence
    does: Resolves default branches and baselines, and collects committed and local changes
    code: ["packages/cli/src/git.ts"]
    reuse:
      - Run Git through this module. It uses argument arrays with the shell disabled.
  local-server:
    kind: api
    name: Local server
    does: Serves packaged assets and explicit data routes on loopback only
    code: ["packages/cli/src/serve.ts"]
    tech: Node http + sirv
  packaging:
    kind: module
    name: Packaging
    does: Bundles owned code and packages the viewer and parser assets
    code: ["packages/cli/scripts/**", "packages/cli/package.json"]
    tech: esbuild
links:
  - commands uses build-pipeline
  - commands uses local-server
  - build-pipeline uses git-evidence
  - build-pipeline uses assembler
  - build-pipeline writes graph-artifacts
  - git-evidence uses git-binary
  - local-server reads graph-artifacts
```
