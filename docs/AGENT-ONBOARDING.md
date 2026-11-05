# Introduce Archeion to a repository

This guide is for a developer or coding agent preparing architecture knowledge
for an existing project. The project keeps the reviewed `.archeion/` Markdown;
Archeion stays in a separate tool installation.

Archeion 0.1.0 is not published to the npm registry. Use a locally built tarball;
do not assume `npx archeion` can download it. Node.js 24 and Git are required.
No .NET runtime or consumer-project dependency installation is needed.

## Install the tool separately

In an Archeion source checkout:

```sh
npm ci
npm run build
npm pack --workspace archeion
```

The last command writes `archeion-0.1.0.tgz` in the current directory. Install it
outside the consumer repository, replacing the example paths with actual paths:

```sh
npm install --prefix path/to/tool path/to/archeion-0.1.0.tgz --no-audit --no-fund
node path/to/tool/node_modules/archeion/dist/cli.js --version
node path/to/tool/node_modules/archeion/dist/cli.js --help
```

Use absolute paths when running from different directories. Quote paths containing
spaces. The direct `node .../dist/cli.js` invocation works on Windows and Unix and
avoids platform-specific npm executable shims. In PowerShell, use `npm.cmd` if
execution policy blocks the npm script launcher.

The installed authoring guides are in `path/to/tool/node_modules/archeion/dist/docs/`.
Keep the tool installation and tarball out of the consumer repository. Do not add
Archeion to its application dependencies or change its lockfile to use this guide.

## 1. Initialize a starter

Read the consumer repository's `AGENTS.md`, README, existing architecture notes,
and applicable contribution rules first. Inspect its source layout, entry points,
contracts, manifests, and deployment configuration. Reuse useful notes and IDs.

```sh
node path/to/tool/node_modules/archeion/dist/cli.js init -C path/to/project
```

`init` preserves an existing `.archeion/system.md`. Otherwise it creates a small
placeholder with one service and `code: ["src/**"]`. It also adds
`.archeion/.generated/` to the project's `.gitignore` when needed. It does not
analyze the architecture, create a complete map, or install anything in the project.

## 2. Draft a small map from actual source

Follow the [knowledge format](KNOWLEDGE-FORMAT.md). Replace the generated
placeholder with a few parts that answer useful questions about the real project.
Use stable explicit IDs, clear responsibilities, and repository-relative `code`
globs that match the files you inspected. A part is declared once across the whole
workspace; its name and source location may change without changing its ID.

For example, only if these directories and this call exist, `.archeion/system.md`
could contain:

````markdown
---
archeion: 1
id: example-app
name: Example app
---
# Example app

A browser application and API for managing records.

```archeion
parts:
  records-web:
    kind: app
    does: Lets users search and edit records
    code: ["frontend/src/**"]
    httpTargets: { "/api": records-api }
    reuse: ["Use the existing record editor for record updates."]
  records-api:
    kind: api
    does: Validates record changes and provides record queries
    code: ["backend/src/**"]
links:
  - records-web calls records-api via /api/records
```
````

Do not copy those assertions into a project without confirming them. Authored
links are reviewed knowledge; syntax extraction may corroborate them, but it does
not prove runtime execution. Keep uncertain relationships explicit in prose or
leave references unresolved so the viewer shows the gap.

Use `.archeion/parts/<name>.md` for useful detail. Its frontmatter `id` identifies
an already declared part; the first paragraph describes it, and `## Rules` and
`## Reuse` bullet lists preserve constraints and existing capabilities. Declare
children there when needed, rather than redeclaring the parent. Keep files at most
150 lines, map blocks at most 12 parts, and each `does` at most 100 characters.

Add a prepared flow only when it explains a useful, source-backed path. For the
example above, `.archeion/flows/edit-record.md` might be:

````markdown
---
id: edit-record
name: User edits a record
---
# User edits a record

The intended request path from the editor to the API.

```archeion
steps:
  - records-web calls records-api | The editor submits the record change
```
````

Flows have at most 12 steps. A step without a matching connection remains a
visible gap. Prepared flows describe architecture, not observed traffic.

Read [extraction coverage](EXTRACTION-COVERAGE.md) before relying on discovery:

- Current source extraction covers specified literal TS/TSX HTTP calls and C#
  routes, HTTP calls, and Service Bus operations.
- Documents cover supported OpenAPI operations/local references, literal ARM JSON
  resources, selected Azure hostnames in configuration, and `package.json`/`.csproj`
  dependencies. HTTP linking needs `httpTargets`; event linking needs one known
  broker with the exact topic; resources need an exact type and identifier.
- Java and Maven are unsupported. Custom client wrappers, dynamic URLs/topics,
  reflection, arbitrary control flow, Bicep, and Terraform are not general semantic
  discovery. Reviewed knowledge can describe relationships the extractors cannot.

Never copy secrets, credentials, or full connection strings into knowledge.
Configuration extraction retains known Azure resource references rather than
credential values. Inspect authored knowledge and generated evidence before sharing.
Neither `build` nor `view` calls an LLM or builds the consumer application. An
agent may help draft knowledge, but that draft still needs review against the code.

## 3. Validate and inspect before committing

```sh
node path/to/tool/node_modules/archeion/dist/cli.js check -C path/to/project
node path/to/tool/node_modules/archeion/dist/cli.js view -C path/to/project --no-open
```

`check` writes no artifacts and exits 1 for errors. Resolve errors and review each
warning, including unmapped facts, unresolved references, flow gaps, and unsupported
patterns. Verify globs against the actual files. A successful check validates the
supported rules; it does not certify
that the architecture description is semantically correct.

Open the printed loopback URL. Inspect Atlas for ownership and nesting, Tracer for
the prepared path and gaps, Sonar for reuse notes, and the evidence and "What was
read" coverage. `view` builds `.archeion/.generated/graph.json` and `build-info.json`
before serving; `--watch` enables rebuilds while reviewing changes. Stop it with
Ctrl+C. Use `build` when artifacts alone are needed.

Radar needs usable Git history and a baseline. Missing history is unavailable,
not evidence of no changes. The default comparison uses the repository's default
branch; on that branch it shows local edits. Choose another baseline explicitly
with `view --base <ref>` or `build --base <ref>`. There is no automatic
"last reviewed" baseline, and agent authorship is not inferred automatically.

Review `git diff` and new files before committing. Keep the intended knowledge
files and generated-output ignore; exclude `.archeion/.generated/`, local tool
files, and machine-specific manifests. Summarize what was read, assumptions,
unresolved gaps, and exact checks for the reviewer. Commit, push, or publish only
within the user's authorization; onboarding alone does not authorize publication.

## Combine several repositories

Keep reviewed knowledge committed beside the code it describes. A local parent
directory can combine independent repositories without adding a workspace manifest
to each repository:

```text
workspace/
  .archeion/workspace.yaml
  frontend/.git/
  frontend/.archeion/system.md
  backend/.git/
  backend/.archeion/system.md
```

The parent can stay outside Git, with a local `.archeion/workspace.yaml`:

```yaml
archeion: 1
id: example-platform
name: Example platform
repos:
  - id: frontend
    path: frontend
    defaultBranch: main
  - id: backend
    path: backend
    defaultBranch: main
```

Paths are relative to `workspace/`, not to `.archeion/`. Set `defaultBranch` to
each repository's real default, or omit it to use Git's remote/default inference.
Run `check -C path/to/workspace` and `view -C path/to/workspace --no-open` with the
same installed CLI. Per-repository comparisons accept, for example,
`view --base frontend=main backend=release -C path/to/workspace`.

Do not put a repository at `path: "."` while also keeping its knowledge beside
the workspace manifest: root Markdown is loaded as workspace knowledge and that
repository would load it again, causing duplicate declarations. Use the parent
layout above. A workspace-only `.archeion/system.md` is optional; create it only
for shared knowledge, not a duplicate of a repository's map.

Part IDs must be unique across repositories. Declare a shared part or resource
once; other repositories can refer to its ID or use `contributes` to associate
their code and reuse notes. Keep each contribution's globs relative to its own
repository. Use exact resource identities and reviewed target/topic context rather
than merging similar names. Review the combined map as well as each repository.

## Instructions to copy into a consumer AGENTS.md

Adapt the tool path and the project's review rules before adding this block:

```markdown
## Architecture knowledge with Archeion

- Read the project's instructions and existing `.archeion/` knowledge before edits.
- Use Node.js 24 and the separately installed CLI at
  `path/to/tool/node_modules/archeion/dist/cli.js`; do not add it to application
  dependencies. Read its `dist/docs/AGENT-ONBOARDING.md`, knowledge format, and
  extraction coverage when introducing or extending the map.
- When asked to initialize: run `node <cli-path> init -C <project-path>`, inspect
  actual source/contracts/configuration, and replace the stub with a small draft.
- Preserve stable explicit IDs, declare each part once, and use repository-relative
  code globs. Record concrete responsibilities, rules, reuse notes, and useful
  prepared flows. Reuse existing notes instead of duplicating them.
- Keep unsupported extraction and uncertain relationships visible. Never invent
  runtime behavior, automatic authorship, or a last-reviewed comparison baseline.
- Run `node <cli-path> check -C <project-path>`, review every warning, then inspect
  `node <cli-path> view -C <project-path> --no-open` and its evidence/coverage.
- Keep `.archeion/.generated/` ignored. Never put secrets in knowledge. Review the
  source-backed draft and Git diff before committing; publish only when authorized.
```
