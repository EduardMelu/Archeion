# Contributing

Use Node.js 24, npm, and Git. No .NET runtime is required to develop or run the
existing C# extraction. Keep changes focused and follow [AGENTS.md](AGENTS.md)
for module boundaries and verification expectations.

```sh
git clone https://github.com/EduardMelu/Archeion.git
cd Archeion
npm ci
npm run build
npm test
```

In PowerShell, use `npm.cmd` and `npx.cmd` if execution policy prevents the `.ps1`
launchers from running. Do not change machine policy or global Git settings.

## Working locally

```sh
npm run archeion -- view --no-open
```

Open the printed loopback URL. For viewer development, keep that server running
and start `npm run dev -w @archeion/viewer` in another terminal. The generated
map lives under `.archeion/.generated/` and is ignored by Git.

## Checks

| Command | Purpose |
| --- | --- |
| `npm run lint` | Formatting and lint |
| `npm run typecheck` | Core, CLI, viewer, and browser-test types |
| `npm test` | Core/CLI and viewer logic, including temporary Git repositories |
| `npm run build` | Export shared schemas, build viewer, bundle CLI and assets |
| `npm run check:package` | Install the packed CLI outside the checkout and exercise it |
| `npm run e2e` | Browser acceptance using software WebGL |
| `npm run perf` | Frame and input budgets on the machine's real GPU |

Run `npm run build` before package, browser, or performance checks. Install the
browser once with `npx playwright install chromium`; on Linux, the CI equivalent
is `npx playwright install --with-deps chromium` when system dependencies are
needed. Performance results describe the recorded machine, not every GPU.

CI runs lint, types, build, schema-drift verification, tests, package installation,
and browser acceptance on Windows and Linux. If you change shared contracts,
include the regenerated `packages/core/schema/` files. For local schema review,
`git diff -- packages/core/schema` shows the changes; after the generated files
are committed, `git diff --exit-code packages/core/schema` is the CI drift check.

## Proposing a change

Explain the concrete problem, resulting behavior, and checks performed. Add a
meaningful regression test for changed logic. Update
[extraction coverage](docs/EXTRACTION-COVERAGE.md) when supported patterns change
and [the knowledge format](docs/KNOWLEDGE-FORMAT.md) when authoring behavior changes.
Use the [agent onboarding guide](docs/AGENT-ONBOARDING.md) to map another project.

Review the diff for secrets, personal paths, generated output, and unrelated work
before submitting. Keep architecture refactors and dependency migrations separate
from a focused fix unless they are necessary to the agreed change.
