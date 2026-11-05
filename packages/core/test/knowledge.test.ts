import { describe, expect, it } from "vitest";
import { renderTrail } from "../src/build";
import type { Trail } from "../src/contracts";
import { parseKnowledge } from "../src/knowledge";

const system = (map: string, front = "id: r\nname: R") => ({
  path: ".archeion/system.md",
  content: `---\n${front}\n---\n# R\n\nPurpose.\n\n## Map\n\n\`\`\`archeion\n${map}\n\`\`\`\n`,
});

describe("reading knowledge", () => {
  it("reads parts, links, and their source lines", () => {
    const k = parseKnowledge("r", [
      system(
        "parts:\n  a:\n    kind: service\n    does: Does A\n    code: ['src/**']\n  b:\n    kind: database\nlinks:\n  - a writes b via sql",
      ),
    ]);
    expect(k.diagnostics).toEqual([]);
    expect(k.parts.map((p) => [p.id, p.line])).toEqual([
      ["a", 13],
      ["b", 17],
    ]);
    expect(k.parts[0]?.name).toBe("A");
    expect(k.links[0]).toMatchObject({ from: "a", verb: "writes", to: "b", via: "sql", line: 20 });
  });

  it("nests the parts of a part file under it and keeps its prose", () => {
    const k = parseKnowledge("r", [
      {
        path: ".archeion/parts/a.md",
        content:
          "---\nid: a\n---\n# A\n\nThe about line.\n\n## Rules\n\n- Rule one.\n\n## Reuse\n\n- Reuse me.\n\n```archeion\nparts:\n  child:\n    kind: module\n```\n",
      },
    ]);
    expect(k.parts[0]).toMatchObject({ id: "child", parent: "a" });
    expect(k.prose[0]).toEqual({
      part: "a",
      about: "The about line.",
      rules: ["Rule one."],
      reuse: ["Reuse me."],
    });
  });

  it("lets a part name a parent declared elsewhere, independent of repository", () => {
    const k = parseKnowledge("r", [
      system("parts:\n  a:\n    kind: module\n    parent: other-repos-system"),
    ]);
    expect(k.parts[0]?.parent).toBe("other-repos-system");
  });

  it("makes malformed input actionable, with file and line", () => {
    const k = parseKnowledge("r", [
      system("parts:\n  a:\n    kind: microservice\nlinks:\n  - a frobnicates b"),
    ]);
    const codes = k.diagnostics.map((d) => d.code);
    expect(codes).toEqual(["invalid-part", "invalid-link"]);
    expect(k.diagnostics[0]).toMatchObject({ file: ".archeion/system.md", part: "a" });
    expect(k.diagnostics[1]?.line).toBe(16);
  });

  it("does not throw on broken YAML", () => {
    const k = parseKnowledge("r", [system("parts: [unterminated")]);
    expect(k.diagnostics[0]?.code).toBe("invalid-map");
  });
});

describe("budgets", () => {
  it("enforces parts per map and description length", () => {
    const many = Array.from({ length: 13 }, (_, i) => `  p${i}:\n    kind: module`).join("\n");
    const long = `  long:\n    kind: module\n    does: ${"x".repeat(101)}`;
    const k = parseKnowledge("r", [system(`parts:\n${many}\n${long}`)]);
    const codes = k.diagnostics.map((d) => d.code);
    expect(codes).toContain("budget-parts");
    expect(codes).toContain("budget-does");
  });

  it("enforces file length and rejects hidden Unicode", () => {
    const k = parseKnowledge("r", [
      { path: ".archeion/parts/x.md", content: `---\nid: x\n---\n${"line\n".repeat(160)}` },
      { path: ".archeion/parts/y.md", content: "---\nid: y\n---\n# Y\u202E\n" },
    ]);
    const codes = k.diagnostics.map((d) => d.code);
    expect(codes).toContain("budget-lines");
    expect(codes).toContain("hidden-unicode");
  });

  it("enforces flow length and step grammar", () => {
    const steps = Array.from({ length: 13 }, () => "  - a calls b | Hop").join("\n");
    const k = parseKnowledge("r", [
      {
        path: ".archeion/flows/f.md",
        content: `---\nid: f\nname: F\n---\n# F\n\n\`\`\`archeion\nsteps:\n${steps}\n  - nonsense\n\`\`\`\n`,
      },
    ]);
    const codes = k.diagnostics.map((d) => d.code);
    expect(codes).toContain("budget-steps");
    expect(codes).toContain("invalid-flow-step");
    expect(k.flows[0]?.steps).toHaveLength(13);
  });
});

describe("trail round trip", () => {
  const trail: Trail = {
    version: 1,
    id: "why-slow",
    title: "Why is checkout slow?",
    question: "Which hop adds the most risk?",
    finding: "The payment gateway.",
    author: "eduard",
    snapshot: { graphDigest: "abc", repos: [{ repo: "r", head: "123", stateId: "456" }] },
    steps: [
      {
        eye: "tracer",
        scope: "orders",
        selected: "payments",
        flow: "place-order",
        flowStep: 2,
        query: null,
        note: "Starts here: multiple lines\nare preserved.",
        targets: [{ part: "payments", fingerprint: "fff" }],
      },
    ],
  };

  it("survives rendering to Markdown and reading back", () => {
    const k = parseKnowledge("r", [
      { path: ".archeion/trails/why-slow.md", content: renderTrail(trail) },
    ]);
    expect(k.diagnostics).toEqual([]);
    expect(k.trails[0]).toEqual(trail);
  });
});
