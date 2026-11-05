// The highest useful boundary without a browser: real fixture files through the CLI pipeline.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type Graph, graphSchema } from "@archeion/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { artifactsDir, runBuild, writeArtifacts, writeFailure } from "../src/pipeline";

const fixture = new URL("../../../fixtures/platform/", import.meta.url);
const scratch = mkdtempSync(path.join(tmpdir(), "archeion-platform-"));
const workspace = path.join(scratch, "platform");
let graph: Graph;

const part = (id: string) => {
  const found = graph.parts.find((p) => p.id === id);
  if (!found) throw new Error(`No part ${id}`);
  return found;
};
const connection = (from: string, verb: string, to: string) =>
  graph.connections.find((c) => c.id === `${from}|${verb}|${to}`);

beforeAll(async () => {
  cpSync(fixture, workspace, { recursive: true });
  graph = (await runBuild({ root: workspace })).graph;
});

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("A1: a platform spanning three repositories", () => {
  it("shows projects and external resources together, whatever repo they came from", () => {
    const top = graph.parts.filter((p) => p.parent === null).map((p) => p.id);
    expect(top).toEqual(
      expect.arrayContaining([
        "storefront",
        "orders-service",
        "fulfilment-service",
        "orders-db",
        "order-bus",
        "documents-store",
        "platform-vault",
        "payment-gateway",
      ]),
    );
    expect(graph.repos.map((r) => r.id)).toEqual(
      expect.arrayContaining(["shop-web", "orders-api", "fulfilment-worker"]),
    );
  });

  it("lets one logical system contain parts from several repositories", () => {
    expect(part("invoice-pdf").parent).toBe("customer-comms");
    expect(part("notifications").parent).toBe("customer-comms");
    expect(part("invoice-pdf").repos).toEqual(["orders-api"]);
    expect(part("notifications").repos).toEqual(["fulfilment-worker"]);
    expect(part("customer-comms").hasInside).toBe(true);
  });
});

describe("A2: shared resource identity", () => {
  it("links both projects to one established resource, with evidence from both", () => {
    const publish = connection("order-events", "publishes", "order-bus");
    const consume = connection("order-intake", "consumes", "order-bus");
    expect(publish?.provenance).toBe("both");
    expect(consume?.provenance).toBe("both");
    expect(publish?.evidence.some((e) => e.repo === "orders-api" && e.kind === "code")).toBe(true);
    expect(consume?.evidence.some((e) => e.repo === "fulfilment-worker" && e.kind === "code")).toBe(
      true,
    );
    expect(consume?.crossRepo).toBe(true);
    const repos = part("order-bus").evidence.map((e) => e.repo);
    expect(repos).toEqual(expect.arrayContaining(["orders-api", "fulfilment-worker"]));
    expect(part("order-bus").provenance).toBe("both");
  });

  it("never merges resources on similar names", () => {
    const replica = graph.parts.find((p) => p.resource?.identifier === "acme-orders-sql-replica");
    expect(replica?.id).toBe("azure:Microsoft.Sql/servers:acme-orders-sql-replica");
    expect(replica?.provenance).toBe("extracted");
    expect(part("orders-db").evidence.some((e) => e.detail?.includes("replica"))).toBe(false);
  });

  it("keeps a reviewed declaration for a resource defined outside the repositories", () => {
    const vault = part("platform-vault");
    expect(vault.evidence.some((e) => e.kind === "knowledge")).toBe(true);
    expect(vault.evidence.some((e) => e.kind === "infrastructure")).toBe(false);
    expect(vault.evidence.some((e) => e.kind === "configuration")).toBe(true);
  });

  it("carries infrastructure evidence, and a resource only infrastructure knows about", () => {
    const db = part("orders-db");
    expect(
      db.evidence.some((e) => e.kind === "infrastructure" && e.file === "infra/main.json"),
    ).toBe(true);
    const cache = graph.parts.find((p) => p.resource?.identifier === "acme-cache");
    expect(cache?.provenance).toBe("extracted");
    expect(cache?.kind).toBe("cache");
  });

  it("flags two declarations claiming one identity", async () => {
    const copy = path.join(scratch, "conflict");
    cpSync(workspace, copy, { recursive: true });
    const file = path.join(copy, ".archeion", "system.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "  payment-gateway:",
        "  second-bus:\n    kind: queue\n    resource: { type: Microsoft.ServiceBus/namespaces, identifier: ACME-BUS }\n  payment-gateway:",
      ),
    );
    const { graph: conflicted } = await runBuild({ root: copy });
    expect(conflicted.diagnostics.map((d) => d.code)).toContain("resource-identity-conflict");
  });
});

describe("E1: incomplete evidence", () => {
  it("keeps an undeclared reference visible as an unknown stub", () => {
    const carrier = connection("shipping", "calls", "unknown:carrier-api");
    expect(carrier?.resolution).toBe("unknown");
    expect(carrier?.reason).toContain("carrier-api");
    expect(part("unknown:carrier-api").kind).toBe("unknown");
    expect(part("unknown:carrier-api").parent).toBe("fulfilment-service");
    // Attached to the part that made the reference, so its parents can show the problem.
    expect(graph.diagnostics.find((d) => d.code === "unresolved-ref")?.part).toBe("shipping");
  });

  it("does not guess an HTTP target without context", () => {
    const stub = "unknown:http:GET /catalog-api/products";
    expect(connection("catalog-browser", "calls", stub)?.resolution).toBe("unknown");
    expect(connection("catalog-browser", "calls", stub)?.reason).toContain("httpTargets");
  });

  it("keeps a call with a known target but no matching route unknown", () => {
    const gift = connection("checkout", "calls", "orders-service");
    expect(gift?.resolution).toBe("unknown");
    expect(gift?.reason).toContain("POST /api/gift-cards");
  });

  it("links extracted HTTP calls to the part serving the route, with both sites as evidence", () => {
    const order = connection("checkout", "calls", "orders-endpoints");
    expect(order?.provenance).toBe("both");
    expect(order?.resolution).toBe("resolved");
    const files = order?.evidence.map((e) => e.file) ?? [];
    expect(files).toEqual(
      expect.arrayContaining(["src/checkout/CheckoutPage.tsx", "src/Orders.Api/Program.cs"]),
    );
  });

  it("reports unsupported constructs instead of treating them as absent", () => {
    const row = (repo: string, extractor: string) =>
      graph.coverage.find((c) => c.repo === repo && c.extractor === extractor);
    expect(row("shop-web", "typescript")?.status).toBe("partial");
    expect(
      row("shop-web", "typescript")?.unsupported.some((u) => u.message.includes("dynamic")),
    ).toBe(true);
    expect(row("fulfilment-worker", "csharp")?.unsupported.map((u) => u.construct)).toEqual(
      expect.arrayContaining(["PostAsJsonAsync", "CreateReceiver"]),
    );
    expect(row("orders-api", "csharp")?.unsupported.map((u) => u.construct)).toContain("MapGroup");
    expect(row("orders-api", "arm")?.unsupported[0]?.message).toContain("template expression");
    expect(row("orders-api", "configuration")?.unsupported[0]?.construct).toBe("PaymentsApiKey");
  });

  it("never writes configuration secrets into the graph", () => {
    const text = JSON.stringify(graph);
    expect(text).not.toContain("fixture-placeholder");
    expect(text).not.toContain("SharedAccessKey");
    expect(text).not.toContain("Password=");
    expect(text).not.toContain("example.invalid");
  });
});

describe("T1 inputs: prepared flows", () => {
  it("resolves steps to connections and keeps unresolved steps as gaps", () => {
    const flow = graph.flows.find((f) => f.id === "place-order");
    expect(flow?.steps.length).toBe(10);
    expect(flow?.steps[0]?.connection).toBe("checkout|calls|orders-endpoints");
    const gaps = flow?.steps.filter((s) => s.gap) ?? [];
    expect(gaps.map((s) => s.to)).toEqual(["carrier-api"]);
    expect(graph.diagnostics.some((d) => d.code === "flow-step-without-link")).toBe(true);
  });
});

describe("K1 and reproducibility", () => {
  it("builds without Git, marking the comparison unavailable rather than unchanged", () => {
    const row = graph.comparison.repos.find((r) => r.repo === "shop-web");
    expect(row?.status).toBe("unavailable");
    expect(graph.comparison.files).toEqual([]);
  });

  it("produces byte-identical output for identical inputs", async () => {
    const first = await runBuild({ root: workspace });
    const second = await runBuild({ root: workspace });
    expect(second.text).toBe(first.text);
    expect(second.digest).toBe(first.digest);
    expect(first.text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(first.text).not.toContain(scratch.replaceAll("\\", "/"));
  });

  it("keeps the previous graph usable when a rebuild fails", async () => {
    const outDir = artifactsDir(workspace);
    await writeArtifacts(outDir, await runBuild({ root: workspace }));
    const before = readFileSync(path.join(outDir, "graph.json"), "utf8");
    await writeFailure(outDir, "workspace.yaml is broken");
    expect(readFileSync(path.join(outDir, "graph.json"), "utf8")).toBe(before);
    const info = JSON.parse(readFileSync(path.join(outDir, "build-info.json"), "utf8"));
    expect(info.status).toBe("failed");
    expect(info.failure).toContain("broken");
    expect(info.graphDigest).not.toBeNull();
  });

  it("writes a graph that its own schema accepts", async () => {
    const outDir = artifactsDir(workspace);
    await writeArtifacts(outDir, await runBuild({ root: workspace }));
    const raw = JSON.parse(readFileSync(path.join(outDir, "graph.json"), "utf8"));
    expect(graphSchema.safeParse(raw).success).toBe(true);
  });

  it("uses the Git binary from this machine", () => {
    expect(execFileSync("git", ["--version"]).toString()).toContain("git version");
  });
});
