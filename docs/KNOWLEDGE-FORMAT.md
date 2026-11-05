# Knowledge format

Status: established by the first implementation slices, 2026-11-05. The parser in [`packages/core/src/knowledge.ts`](../packages/core/src/knowledge.ts) is the authority; [`fixtures/platform`](../fixtures/platform) is a working example. The JSON contracts are exported to [`packages/core/schema`](../packages/core/schema).

## Layout

```text
.archeion/
  system.md            this repository's top-level parts and links
  parts/<anything>.md  the inside of a part
  flows/<anything>.md  prepared flows for Tracer
  trails/<id>.md       reviewed investigations, written by `archeion import-trail`
  workspace.yaml       optional: other repositories to combine
  .generated/          artifacts, never committed
```

## Part identity

A part's id is explicit and unique across the workspace. It is independent of its name, its parent, and which repository declares it, so a logical system can hold parts from several repositories. Exactly one map block declares an id; a second declaration is the `duplicate-part` error.

## Map blocks

A fenced `archeion` block holds YAML:

````markdown
```archeion
parts:
  orders-service:
    kind: service          # required; see the contract for the list
    name: Orders service   # default: the id in title case
    does: One line, at most 100 characters
    tech: ASP.NET Core
    parent: commerce       # default: the part this file describes, else top level
    code: ["src/Orders.Api/**"]        # repo-relative globs; the deepest match owns a file
    contract: openapi/orders.yaml      # OpenAPI document this part serves
    httpTargets: { "/api": orders-api } # URL prefix to the part that serves it
    topics: [order-submitted]          # topics a broker is known to carry
    resource: { type: Microsoft.ServiceBus/namespaces, identifier: acme-bus }
    reuse: ["When to use this rather than building another."]
    rules: ["A constraint worth knowing."]
contributes:               # evidence for a part another repository declares
  documents-store:
    code: ["src/Docs/**"]
    reuse: ["A note from this repository."]
links:
  - orders-service calls payment-gateway via POST /charges
```
````

Link grammar: `<from> <verb> <to> [via <detail>]`, where the verb is `calls`, `reads`, `writes`, `publishes`, `consumes`, or `uses`. A reference to an id no repository declares becomes a visible unknown stub and an `unresolved-ref` warning. It is never dropped.

## Part files

The frontmatter `id` names the part described, and parts in the file nest under it unless they name another parent. The first paragraph describes the part. `## Rules` and `## Reuse` bullet lists add to the declaration, even when that declaration lives in another repository.

## Flows

```markdown
---
id: place-order
name: Customer places an order
---
# Customer places an order

One line on what this explains.
```

The block holds `steps:`, one per line: `<from> <verb> <to> | <caption>`. A step that matches no connection stays in the flow as a visible gap, with a `flow-step-without-link` warning.

## Workspace

```yaml
archeion: 1
id: acme
name: Acme platform
repos:
  - id: shop-web
    path: shop-web
    defaultBranch: main   # optional; otherwise origin/HEAD, then a local inference
    base: some-ref        # optional fixed comparison baseline
```

Markdown beside `workspace.yaml` is read too, for knowledge no single repository owns, such as a resource defined elsewhere. With no `workspace.yaml`, the directory is a one-repository workspace named by its `system.md`.

## Budgets

Enforced by `archeion check` as errors: 150 lines per knowledge file, 12 parts per map block, 100 characters for `does`, 12 flow steps, and no hidden or bidirectional Unicode.

## Secrets

Knowledge records resource references and relationships. Configuration scanning takes only known Azure hostnames from values and never copies anything else, so a connection string's credentials cannot reach the graph. Do not write secrets into knowledge files.
