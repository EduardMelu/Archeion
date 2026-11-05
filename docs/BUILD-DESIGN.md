# Build and runtime design

The TypeScript core, CLI, and viewer implement the [product requirements](SPEC.md). Package manifests and the lockfile record the selected stack; local verification and measured results are in the [verification report](../reports/ACCEPTANCE.md).

## Modules and interfaces

Keep TypeScript core and CLI packages plus one viewer in npm workspaces, with one lockfile. The viewer is the main user-facing product; the commands prepare and validate the data it explores.

| Module | Responsibility | Interface |
| --- | --- | --- |
| Core | Knowledge/source parsing, supported extraction, resolution, validation, comparison, graph assembly | Supplied contents/facts and snapshot inputs produce a graph, diagnostics, and extraction coverage. |
| CLI | Filesystem/Git access, commands, input collection, artifact writing, local hosting | Commands select workspace/comparison and produce artifacts plus actionable diagnostics. |
| Viewer | Artifact loading/validation, layout, rendering, eyes, evidence, investigation state | It consumes the generated contract; it does not discover architecture through live LLM calls. |

Core parsers accept supplied content. The CLI owns disk/process I/O. Keep parser implementation internal rather than creating a plugin system. Use explicit data inputs/results; add interfaces/projects only when a real variation or independent use requires them.

## Contract ownership

Shared Zod 4 schemas own graph/trail wire shapes, validation, and inferred TypeScript types. Both CLI and viewer import the same contracts. Export public JSON Schema using `z.toJSONSchema()`; there is no cross-language type-generation chain.

Keep the shared contracts entry browser-compatible, with no Node, filesystem, parser, or server imports. Use JSON-representable Zod wire schemas. Contract fixtures cover required fields, nullability, enum strings, versioning, unknown fields, and JSON Schema export. Detect exported-schema drift in CI.

The viewer validates each artifact once when loading. Core validation additionally handles references, identity, budgets, contradictory evidence, and flow consistency; a shape schema cannot establish those facts.

## Generated artifacts and reproducibility

| Artifact | Contents |
| --- | --- |
| `graph.json` | Architecture, evidence, coverage, resolved comparisons, changes, and available saved investigations. |
| `build-info.json` | Wall-clock build time, graph digest, build/watch metadata; no additional architecture facts. |
| Local layout cache | Presentation positions/routes keyed by workspace, scope, and stable part IDs. |
| Exported trail JSON | Views/notes, snapshot identity, relevant comparison fingerprints. |

Make graph.json deterministic for identical inputs: stable ordering, repo-relative evidence, resolved baselines, and content-derived working-state IDs. Build time belongs in build-info.json so rebuilding unchanged inputs does not create an architecture change.

Write artifacts atomically. The viewer verifies matching digests and validates a new graph before replacing the previous usable model. Failed rebuilds remain visible. Generated outputs stay outside committed knowledge. Exact field names and authoring examples are established in the first implementation slice.

## Architecture and resource identity

Stable explicit IDs are separate from names, logical parents, and source locations. Parts may have evidence in multiple repos; systems may contain parts from multiple repos. Workspace configuration expresses logical grouping independently of code ownership.

One reviewed declaration establishes a shared resource identity; other projects reference it. Supported resource identifiers can corroborate it. Conflicts produce diagnostics; similar names alone never merge resources. Preserve known environment evidence without adding an environment-comparison feature.

HTTP linking needs target context as well as method/path. Event linking needs a known broker/namespace and exact supported topic identity. Ambiguity remains unknown. Syntax extraction does not prove runtime execution.

## Knowledge and extraction coverage

Retain the proposed .archeion structure of small system/part Markdown descriptions, flows, and later trails, with structured YAML metadata/map blocks. unified/remark-parse plus remark-frontmatter handle structure and positions; yaml handles metadata. Core validates authored rules and references.

Initial discovered coverage is explicit:

- C# syntax for specified ASP.NET route and HTTP-client patterns, through web-tree-sitter and a C# WASM grammar.
- TS/TSX syntax for supported literal frontend HTTP calls, through the same runtime and separate TS/TSX WASM grammars.
- OpenAPI operations and supported local references, through Swagger Parser with explicit version/coverage checks.
- ARM JSON and selected configuration/resource-reference patterns, plus reviewed external-resource declarations.

Report unsupported constructs and ambiguity. General Bicep/Terraform analysis, dynamic URLs, reflection, and arbitrary control-flow reconstruction are not claimed as discovered coverage; reviewed knowledge can still represent them. Do not execute target-project builds merely to extract syntax.

Verify C#/TS/TSX grammar loading and WASM runtime/ABI compatibility on Windows/Linux before parser reliance. Package the runtime and grammar assets explicitly; do not assume grammar source packages already contain suitable WASM files. Node 24 and Git are the documented CLI prerequisites; .NET is not required. Package versions must include applicable published fixes.

## Git and comparison state

Invoke installed Git through Node child-process APIs with individual argument-list entries and shell mode disabled; capture status and cancellation. Resolve and record the actual per-repo default branch/baseline. Missing history or references produce diagnostics.

The default is the merge base with that repo's default branch, plus local work. On the default branch itself this shows local edits until another baseline is selected. Record committed, staged, unstaged, and relevant untracked changes, including removals/renames. Removed parts remain inspectable in comparison results.

Working-state identity comes from relevant content, not just HEAD or a dirty boolean. Part fingerprints include architecture and source-content evidence so trails can notice code changes even when descriptions do not change.

## Scene, layout, and motion

Use an orthographic 2.5D camera. React/DOM owns search, eye/playback controls, and evidence. One Zustand store holds interaction decisions; camera/token/material values stay outside reactive frame-rate updates.

ELK runs in a dedicated worker. Cache each scope's layout and reuse it across eye changes and repeat visits. Place new parts into available space or new groups without freely rearranging unchanged parts. If constraints cannot be satisfied, expose explicit rearrangement. A continuity fixture must prove the policy.

Animate camera, paths, and flow tokens through the Fiber frame loop using elapsed-time deltas. Reuse geometry/materials and preserve scene objects across eye changes. Render on demand at rest, requesting frames until active transitions finish.

Drei supplies crisp local-font labels. Selective bloom emphasises active paths/focus rather than text. Use CSS Modules/custom properties and standard controls around the canvas. WebGL2 is the initial renderer; WebGPU/effect compatibility is a later measured change.

Target 60 fps on a recorded reference device/browser/viewport. In the first visual slice, include a synthetic graph around 500 total parts with a bounded stress view of at least 30 nodes/60 connections, recording the actual visible counts and active effects. After font/shader warm-up, use provisional budgets of median frame interval at most 17 ms, p95 at most 20 ms during a repeatable zoom/motion sequence, and p95 input-to-feedback at most 100 ms after loading. Record draw calls and the measurement conditions. These are selected engineering targets, not achieved measurements or guarantees for every GPU.

The first slice must either meet those budgets on its reference device or address the measured issue before scene complexity grows. Any revision to the fixture/budget is recorded with evidence; it is not silently treated as a pass. Repeat the same measurement in later viewer slices, with the full platform check at the end.

Adapt pixel ratio/effects before sacrificing legibility, control responsiveness, or stable context. Reduced motion preserves the same information. Real browser captures use fixed fonts, viewport, time, and paused animations; functional assertions also check scope, controls, and evidence.

## Trails and storage

Use native IndexedDB for drafts, layouts, and useful snapshot data. Write at save/interaction boundaries, never every frame. Cache loss must not corrupt committed knowledge or imply a successful historical comparison.

Export schema-versioned trail JSON with question, notes, viewpoints, snapshot identity, and relevant fingerprints. Explicit CLI import validates it and creates a small Markdown trail for owner review, preserving existing files. Subsequent builds make imported trails available.

Reopening resolves saved targets against the current graph and reports changed, removed, or unresolved targets. Missing comparison evidence is unavailable rather than unchanged. Full history scrubbing remains deferred.

## Build and distribution

Development/CI uses Node.js 24, npm, TypeScript, and Git. Use npm workspaces for core, CLI, and viewer with one root lockfile; no extra build orchestrator is selected.

Build flow: type-check/build core and its shared schemas; export JSON Schema; build the viewer with Vite; bundle owned CLI/core code as Node ESM with esbuild and package it with compiled viewer assets, fonts, workers, and parser WASM files. Runtime third-party dependencies remain explicit npm dependencies. The installable package must not depend on unpublished private workspace packages. Pin exact compatible versions after package checks.

Vite serves UI development against generated artifacts. The installed view command serves compiled assets and generated data without running the frontend toolchain.

The view command starts a loopback-only Node HTTP server with sirv for packaged immutable assets. Serve explicit graph/build-info routes rather than arbitrary repository files. Generated data uses uncached/revalidated handlers so production static-asset caching cannot hide rebuilds.

POC delivery is an npm CLI package with Node 24 and Git prerequisites. Verify a clean local package install with no .NET dependency, no workspace symlinks, and all required WASM assets present. Local package checks do not publish anything externally.

Watch mode is explicit: the CLI debounces input changes and rebuilds artifacts; the viewer can poll lightweight build metadata and load a changed digest, preserving valid selection/context.

## Verification approach

Use Vitest for core/CLI and pure viewer logic, and Playwright for real browser/WebGL paths. Standard assertions come first. Visual comparison complements navigation/evidence assertions.

CI checks shared schemas and exported-schema drift, types/formatting, Windows/Linux WASM loading and clean npm packaging, and the architect scenarios. Visual/performance verification belongs throughout implementation rather than only in a final cosmetic phase.

Contributor commands and change-specific verification expectations are in [CONTRIBUTING.md](../CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md).
