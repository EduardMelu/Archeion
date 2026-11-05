---
id: viewer
---

# Viewer

The main user-facing product. It renders the generated graph and never discovers architecture on its own.

## Map

```archeion
parts:
  artifact-loader:
    kind: module
    name: Artifact loader
    does: Fetches artifacts, verifies the digest, validates once, and keeps the last good model
    code: ["packages/viewer/src/data/load.ts"]
  interaction-state:
    kind: module
    name: Interaction state
    does: One small store for eye, scope, selection, and playback decisions
    code: ["packages/viewer/src/store.ts"]
    tech: Zustand
  map-logic:
    kind: module
    name: Map logic
    does: Pure rules for scopes, emphasis, search, Tracer hops, trails, and layout continuity
    code: ["packages/viewer/src/logic/**"]
    reuse:
      - Search, emphasis, and containment rules. Reuse them rather than recomputing in a component.
  layout-worker:
    kind: module
    name: Layout worker
    does: Runs ELK off the interaction thread and caches each scope's positions
    code: ["packages/viewer/src/layout/**"]
    tech: ELK.js
  map-scene:
    kind: module
    name: Map scene
    does: Draws parts, metro lines, cutaways, and flow tokens, on demand only
    code: ["packages/viewer/src/scene/**"]
    tech: Three.js + Fiber
  panels:
    kind: module
    name: Panels
    does: The eyes' panels, inspector, outline, and status bar
    code: ["packages/viewer/src/ui/**", "packages/viewer/src/App.tsx", "packages/viewer/src/*.css", "packages/viewer/src/main.tsx"]
  local-cache:
    kind: module
    name: Local cache
    does: IndexedDB for trail drafts and layouts, written at save boundaries only
    code: ["packages/viewer/src/data/idb.ts"]
    tech: IndexedDB
links:
  - artifact-loader uses contracts
  - artifact-loader uses interaction-state
  - panels uses interaction-state
  - panels uses map-logic
  - map-scene uses interaction-state
  - map-scene uses map-logic
  - map-scene uses layout-worker
  - layout-worker uses local-cache
  - panels uses local-cache
```
