import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GRAPH_VERSION,
  graphJsonSchema,
  graphSchema,
  trailJsonSchema,
  trailSchema,
} from "../src/contracts";

const minimalGraph = () => ({
  version: GRAPH_VERSION,
  workspace: { id: "w", name: "W" },
  repos: [{ id: "r", name: "R", git: false, head: null, branch: null, stateId: null }],
  parts: [
    {
      id: "a",
      parent: null,
      name: "A",
      kind: "service",
      does: "",
      about: null,
      tech: null,
      owner: null,
      hasInside: false,
      repos: ["r"],
      code: [],
      rules: [],
      reuse: [],
      topics: [],
      resource: null,
      dependencies: [],
      evidence: [{ kind: "knowledge", repo: "r", file: "f.md", line: 1, detail: null }],
      provenance: "reviewed",
      fingerprint: "abc",
    },
  ],
  connections: [],
  flows: [],
  coverage: [],
  comparison: { repos: [], files: [], commits: [], dependencies: [], parts: [], removedParts: [] },
  trails: [],
  diagnostics: [],
});

describe("graph contract", () => {
  it("accepts a minimal graph", () => {
    expect(graphSchema.safeParse(minimalGraph()).success).toBe(true);
  });

  it("requires explicit nulls rather than missing fields", () => {
    const graph = minimalGraph();
    delete (graph.parts[0] as Partial<(typeof graph.parts)[0]>).parent;
    expect(graphSchema.safeParse(graph).success).toBe(false);
  });

  it("rejects unknown fields so drift is noticed", () => {
    const graph = { ...minimalGraph(), generatedAt: "2026-01-01" };
    expect(graphSchema.safeParse(graph).success).toBe(false);
  });

  it("rejects a kind outside the enum", () => {
    const graph = minimalGraph();
    (graph.parts[0] as { kind: string }).kind = "microservice";
    expect(graphSchema.safeParse(graph).success).toBe(false);
  });

  it("rejects another contract version", () => {
    expect(graphSchema.safeParse({ ...minimalGraph(), version: GRAPH_VERSION + 1 }).success).toBe(
      false,
    );
  });
});

describe("trail contract", () => {
  it("rejects an id that could escape the trails folder", () => {
    const trail = {
      version: 1,
      id: "../../evil",
      title: "T",
      question: "",
      finding: null,
      author: null,
      snapshot: { graphDigest: null, repos: [] },
      steps: [],
    };
    expect(trailSchema.safeParse(trail).success).toBe(false);
    expect(trailSchema.safeParse({ ...trail, id: "ok-id" }).success).toBe(true);
  });
});

describe("exported JSON Schema", () => {
  const committed = (name: string) =>
    JSON.parse(readFileSync(new URL(`../schema/${name}`, import.meta.url), "utf8"));

  it("matches the committed graph schema", () => {
    expect(graphJsonSchema()).toEqual(committed("graph.schema.json"));
  });

  it("matches the committed trail schema", () => {
    expect(trailJsonSchema()).toEqual(committed("trail.schema.json"));
  });

  it("represents nullability, enums, and closed objects", () => {
    const text = JSON.stringify(graphJsonSchema());
    expect(text).toContain('"additionalProperties":false');
    expect(text).toContain('"type":"null"');
    expect(text).toContain('"enum":["reviewed","extracted","both"]');
  });
});

describe("browser-compatible contracts entry", () => {
  it("imports nothing from Node, the filesystem, parsers, or servers", () => {
    const source = readFileSync(new URL("../src/contracts.ts", import.meta.url), "utf8");
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["zod"]);
  });
});
