# Extraction coverage

Status: implemented 2026-11-05. These are the only patterns the CLI claims to discover. Anything else is either reported under the viewer's "What was read" or reviewed knowledge has to carry it. Syntax evidence does not prove that code runs. Fixtures live in [`fixtures/platform`](../fixtures/platform), and [`packages/cli/test/platform.test.ts`](../packages/cli/test/platform.test.ts) asserts them.

## Supported

| Source | Pattern | Fact | Fixture |
| --- | --- | --- | --- |
| C# | `app.MapGet/Post/Put/Delete/Patch("/literal", ...)` | Route | `orders-api/.../Program.cs` |
| C# | `[Route("x")]` with `[HttpGet("y")]` and friends; `[controller]` token | Route | `orders-api/.../InvoicesController.cs` |
| C# | `GetAsync`, `PostAsJsonAsync`, and similar with a literal URL, on a receiver named like `http` or `client` | HTTP call | `orders-api/.../PaymentsClient.cs` |
| C# | `CreateSender("topic")`, `CreateProcessor("topic", ...)`, `CreateReceiver("topic", ...)` | Publish or consume | `orders-api/.../OrderEvents.cs` |
| TS, TSX | `fetch("/literal", { method: "POST" })`; a template string with no substitution | HTTP call | `shop-web/.../CheckoutPage.tsx` |
| TS, TSX | `axios.get/post/put/delete/patch("/literal")` | HTTP call | `shop-web/.../catalogApi.ts` |
| OpenAPI 2.0, 3.0, 3.1 | Operations in a part's `contract`, with local `$ref` only | Route | `orders-api/openapi/orders.yaml` |
| ARM JSON | Literal `type` and `name`; nested sub-resources attribute to their parent's identity | Resource | `orders-api/infra/main.json` |
| `appsettings*.json`, `local.settings.json` | Known Azure hostnames in values: Service Bus, SQL, Blob, Key Vault, Redis, Cosmos DB | Resource use | `orders-api/.../appsettings.json` |
| `package.json`, `.csproj` | Dependencies and `PackageReference` | Dependency | `shop-web/package.json` |

## How facts become connections

- **HTTP** needs target context as well as method and path: the caller's `httpTargets` must name the serving part. With no context, or with a known target but no matching route, the connection stays unknown and says why.
- **Events** need one known broker: exactly one part must list the exact topic. None or several leaves the connection unknown.
- **Resources** merge only on an exact type and identifier. Similar names never merge. Two reviewed declarations of one identity are an error.
- A fact from a file no part's `code` covers is reported as unmapped, not attributed.

## Reported as unsupported

Dynamic URLs and topic names, non-literal route paths, `MapGroup` prefixes (routes keep their local path), ARM template expressions, external OpenAPI references, deploy-time configuration values such as Key Vault references, and unsupported OpenAPI versions.

## Not read at all

Bicep, Terraform, other languages, reflection, dependency injection, and arbitrary control flow. Reviewed knowledge can still describe what these do. Target-project builds never run.

## Parser assets

C#, TypeScript, and TSX grammars are vendored WASM files with recorded versions and checksums: see [`packages/core/grammars/README.md`](../packages/core/grammars/README.md). They load on `web-tree-sitter` 0.27.1 with no .NET runtime or native toolchain.
