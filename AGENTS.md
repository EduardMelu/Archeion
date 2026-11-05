# Working on Archeion

Archeion builds an architecture map from reviewed `.archeion/` knowledge and
supported code evidence. Unknown or ambiguous relationships must stay visible.
Building and exploring a map make no LLM calls and do not build the target project.

## Start here

- Read [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
- For onboarding another repository, follow
  [docs/AGENT-ONBOARDING.md](docs/AGENT-ONBOARDING.md).
- For knowledge changes, read [the format](docs/KNOWLEDGE-FORMAT.md) and
  [extraction coverage](docs/EXTRACTION-COVERAGE.md).
- For viewer changes, read [DESIGN.md](DESIGN.md) and the nearby components.
- Inspect the source and existing tests before changing behavior. Preserve unrelated
  work and use the smallest complete change that follows local patterns.

## Repository map

| Path | Responsibility |
| --- | --- |
| `packages/core/src/contracts.ts` | Shared Zod schemas and inferred graph/trail types |
| `packages/core/src/knowledge.ts` | Knowledge parsing, workspace schema, authoring budgets |
| `packages/core/src/extract/` | Supported syntax, document, configuration, manifest facts |
| `packages/core/src/build.ts` | Graph assembly, resolution, diagnostics |
| `packages/core/src/compare.ts` | Comparison of supplied snapshots and Git facts |
| `packages/cli/src/` | Filesystem/Git I/O, commands, artifacts, loopback server |
| `packages/viewer/src/` | React controls, layout worker, Three.js scene |
| `fixtures/platform/` | Synthetic repositories and reviewed example knowledge |
| `.archeion/` | The tool's own reviewed architecture knowledge |
| `e2e/` | Browser acceptance and measured performance checks |

## Boundaries to preserve

- Core parsers take supplied content. Keep filesystem and process I/O in the CLI.
- Reuse schemas and inferred types from `@archeion/core/contracts`; do not duplicate
  wire shapes. This entry is browser compatible: no Node, filesystem, parser, or
  server imports. The viewer must not import the general core entry.
- Regenerate `packages/core/schema/` with `npm run build` when contracts change and
  review the generated diff. Keep graph serialization deterministic; wall-clock
  metadata belongs in `build-info.json`.
- Evidence from syntax is not proof of runtime execution. Do not invent semantic
  relationships or silently resolve ambiguous calls, topics, or resource identities.
- Extraction changes must update coverage documentation and meaningful fixtures.
  Keep unsupported cases and unavailable Git comparisons explicit.
- The CLI owns atomic artifact writes and loopback hosting. Do not serve arbitrary
  repository files or add consumer build steps to extraction.
- The Zustand store holds interaction decisions. Keep camera, token, material, and
  per-frame transform values in scene refs; animate through the Fiber frame loop.
- Preserve layout continuity, keyboard access, readable evidence, reduced motion,
  and on-demand rendering at rest. Keep bundled fonts and assets local.
- Reuse installed dependencies and existing helpers. Dependency migrations and
  architecture refactors require separate approval when outside the requested task.

## Knowledge changes

Read the code a declaration describes. Keep IDs explicit and stable, one declaring
map block per ID across a workspace, and `code` globs relative to their repository.
Prefer small system and part files with concrete `does`, `rules`, and `reuse` notes.
Prepared flows describe an intended path; they are not observed traffic.

`init` only creates a starter `system.md` and adds the generated-output ignore.
Review and replace its placeholders. Do not commit `.archeion/.generated/` or put
secrets in knowledge. Run `check`, inspect warnings, and review the map and diff
before committing. Do not publish or push consumer knowledge without authorization.

## Verification

Use Node.js 24, npm, and Git. Install development dependencies with `npm ci` at
the repository root; the project uses one lockfile and npm workspaces.

| Change | Relevant checks |
| --- | --- |
| Any code | `npm run lint`, `npm run typecheck`, relevant `npm test` coverage |
| Contracts or build output | `npm run build`; inspect `packages/core/schema/` diff |
| CLI packaging or runtime assets | Build, then `npm run check:package` |
| Viewer behavior or styling | Build, then `npm run e2e`; inspect relevant browser paths |
| Scene motion or performance | Build, then `npm run perf` on a real GPU |
| Knowledge | `npm run archeion -- check`, then inspect with `view` |

Run the broader CI checks for a release or a change spanning these boundaries.
See CONTRIBUTING for browser setup. Report exact checks, failures, and skipped
checks; do not claim a passing result without fresh command output.

## Git and scope

Preserve the user's Git identity, remotes, and global configuration. Do not change
global `safe.directory` or other Git settings to work around the execution host.
Use a command-scoped setting when the host requires it and the repository is trusted.
Keep generated captures, tarballs, caches, and local workspace manifests out of
commits. Review staged content before committing and respect the user's publication
authorization separately from permission to edit files.
