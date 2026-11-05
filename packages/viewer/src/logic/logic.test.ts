import type { Trail } from "@archeion/core/contracts";
import { describe, expect, it } from "vitest";
import { partVisuals, triage } from "./emphasis";
import { computeFrames, type Frame, fitZoom } from "./frames";
import { indexGraph, lowestCommonScope, pathTo, scopeGraph, visibleIn } from "./graphIndex";
import { safeLabel } from "./labels";
import { type CachedLayout, reconcileLayout } from "./layoutPolicy";
import { chamferRoute } from "./route";
import { search } from "./search";
import { statusSentence } from "./status";
import { link, part, testGraph } from "./testGraph";
import { hopView } from "./tracer";
import { captureTargets, compareTrail } from "./trails";

const index = indexGraph(testGraph());

describe("scopes", () => {
  it("walks from the root to a part", () => {
    expect(pathTo(index, "deep")).toEqual(["api", "handler", "deep"]);
    expect(pathTo(index, "web")).toEqual(["web"]);
  });

  it("finds the visible container of a part within a scope", () => {
    expect(visibleIn(index, null, "deep")).toBe("api");
    expect(visibleIn(index, "api", "deep")).toBe("handler");
    expect(visibleIn(index, "web", "deep")).toBeNull();
    expect(visibleIn(index, "api", "api")).toBeNull();
  });

  it("finds the lowest scope where both ends are distinct and visible", () => {
    expect(lowestCommonScope(index, "page-a", "page-b")).toBe("web");
    expect(lowestCommonScope(index, "page-a", "deep")).toBeNull();
    expect(lowestCommonScope(index, "handler", "store-client")).toBe("api");
    expect(lowestCommonScope(index, "deep", "store-client")).toBe("api");
  });
});

describe("what a scope draws", () => {
  it("aggregates hidden connections onto visible parts at the root", () => {
    const { nodes, edges } = scopeGraph(index, null);
    expect(nodes.map((n) => n.id).sort()).toEqual(["api", "db", "web", "worker"]);
    const edge = (key: string) => edges.find((e) => e.key === key);
    expect(edge("web->api")?.connections.sort()).toEqual([
      "page-a|calls|handler",
      "page-b|calls|handler",
    ]);
    expect(edge("api->db")?.connections).toEqual(["store-client|writes|db"]);
    expect(edge("worker->db")?.connections).toEqual(["mailer|reads|db"]);
  });

  it("does not draw connections wholly inside one visible part", () => {
    const { edges } = scopeGraph(index, null);
    expect(edges.some((e) => e.connections.includes("handler|uses|store-client"))).toBe(false);
  });

  it("shows outside neighbours as stubs in a cutaway, left for incoming and right for outgoing", () => {
    const { nodes, edges } = scopeGraph(index, "api");
    expect(
      nodes
        .filter((n) => n.type === "stub")
        .map((n) => n.id)
        .sort(),
    ).toEqual(["stub:in:web", "stub:out:db"]);
    expect(edges.find((e) => e.key === "stub:in:web->handler")?.connections).toHaveLength(2);
    expect(edges.find((e) => e.key === "store-client->stub:out:db")?.connections).toEqual([
      "store-client|writes|db",
    ]);
  });

  it("keeps an unknown connection reachable and marked", () => {
    const { edges } = scopeGraph(index, "worker");
    expect(edges.find((e) => e.key === "mailer->unknown:carrier")?.unknown).toBe(true);
  });
});

describe("Sonar", () => {
  it("ranks by a small documented rule and explains what matched", () => {
    const results = search(index, "send email");
    expect(results[0]?.part).toBe("mailer");
    expect(results[0]?.matched).toEqual(expect.arrayContaining(["does", "reuse"]));
  });

  it("requires every meaningful word, ignoring plurals and stop words", () => {
    expect(search(index, "send an emails").map((r) => r.part)).toEqual(["mailer"]);
    expect(search(index, "send pdf")).toEqual([]);
    expect(search(index, "   ")).toEqual([]);
  });

  it("searches technologies and never returns unknown stubs", () => {
    expect(search(index, "azure sql").map((r) => r.part)).toEqual(["db"]);
    expect(search(index, "carrier")).toEqual([]);
  });

  it("is deterministic for equal scores", () => {
    const a = search(indexGraph(testGraph()), "m");
    const b = search(indexGraph(testGraph()), "m");
    expect(a).toEqual(b);
  });
});

describe("emphasis", () => {
  it("is quiet at rest in Atlas", () => {
    const visuals = partVisuals(index, {
      eye: "atlas",
      scope: null,
      selected: null,
      matches: [],
      flowStep: null,
      flow: null,
    });
    expect([...visuals.values()].every((v) => v.tone === "quiet" && v.badge === null)).toBe(true);
  });

  it("focuses only the selected part in Atlas", () => {
    const visuals = partVisuals(index, {
      eye: "atlas",
      scope: null,
      selected: "api",
      matches: [],
      flowStep: null,
      flow: null,
    });
    expect(visuals.get("api")?.tone).toBe("focus");
    expect(visuals.get("web")?.tone).toBe("quiet");
  });

  it("R3: a collapsed parent summarises changes and context stays distinct", () => {
    const visuals = partVisuals(index, {
      eye: "radar",
      scope: null,
      selected: null,
      matches: [],
      flowStep: null,
      flow: null,
    });
    expect(visuals.get("api")?.badge).toBe("2 changed inside");
    expect(visuals.get("api")?.tone).toBe("focus");
    expect(visuals.get("worker")?.badge).toBe("1 changed inside");
    expect(visuals.get("web")?.tone).toBe("context");
    expect(visuals.get("db")?.tone).toBe("context");
  });

  it("R3: drilling in reaches the changed part, labelled by kind of change", () => {
    const visuals = partVisuals(index, {
      eye: "radar",
      scope: "api",
      selected: null,
      matches: [],
      flowStep: null,
      flow: null,
    });
    expect(visuals.get("store-client")).toMatchObject({
      tone: "focus",
      blip: "hollow",
      tag: "local",
    });
    expect(visuals.get("handler")?.badge).toBe("1 changed inside");
  });

  it("marks an agent trailer distinctly without claiming authorship", () => {
    const visuals = partVisuals(index, {
      eye: "radar",
      scope: "worker",
      selected: null,
      matches: [],
      flowStep: null,
      flow: null,
    });
    expect(visuals.get("mailer")).toMatchObject({ agent: true, tag: "new" });
  });

  it("S1: a collapsed parent summarises matches and everything else dims", () => {
    const visuals = partVisuals(index, {
      eye: "sonar",
      scope: null,
      selected: null,
      matches: ["mailer"],
      flowStep: null,
      flow: null,
    });
    expect(visuals.get("worker")?.badge).toBe("1 match inside");
    expect(visuals.get("web")?.tone).toBe("dim");
  });

  it("dims nothing in Sonar before a search", () => {
    const visuals = partVisuals(index, {
      eye: "sonar",
      scope: null,
      selected: null,
      matches: [],
      flowStep: null,
      flow: null,
    });
    expect(visuals.get("web")?.tone).toBe("quiet");
  });

  it("keeps Tracer's path lit and dims the rest", () => {
    const flow = index.graph.flows[0] ?? null;
    const visuals = partVisuals(index, {
      eye: "tracer",
      scope: "api",
      selected: null,
      matches: [],
      flowStep: 1,
      flow,
    });
    expect(visuals.get("handler")?.tone).toBe("focus");
    expect(visuals.get("store-client")?.tone).toBe("focus");
    expect(visuals.get("db")?.tone).toBe("dim");
  });
});

describe("triage", () => {
  const diag = (p: string, severity: "error" | "warning", code = "c") => ({
    severity,
    code,
    message: "m",
    repo: null,
    file: null,
    line: null,
    part: p,
  });

  it("rolls one part's problems into one mark, errors winning", () => {
    const graph = testGraph({ diagnostics: [diag("page-a", "warning"), diag("page-b", "error")] });
    const { marks, hidden } = triage(indexGraph(graph), ["web", "api"]);
    expect(marks.get("web")).toEqual({ severity: "error", count: 2 });
    expect(hidden).toBe(0);
  });

  it("lights at most three marks and counts the rest", () => {
    const graph = testGraph({
      parts: [...testGraph().parts, part("x", null), part("y", null)],
      diagnostics: [
        diag("web", "warning"),
        diag("api", "error"),
        diag("db", "warning"),
        diag("x", "warning"),
        diag("y", "error"),
      ],
    });
    const { marks, hidden } = triage(indexGraph(graph), ["web", "api", "db", "x", "y"]);
    expect(marks.size).toBe(3);
    expect(hidden).toBe(2);
    expect(marks.get("api")?.severity).toBe("error");
    expect(marks.get("y")?.severity).toBe("error");
  });
});

describe("Tracer hops", () => {
  const flow = testGraph().flows[0];

  it("shows each hop at the lowest scope where both ends are visible", () => {
    const steps = flow?.steps ?? [];
    expect(hopView(index, steps[0] as never)).toMatchObject({
      scope: null,
      from: "web",
      to: "api",
    });
    expect(hopView(index, steps[1] as never)).toMatchObject({
      scope: "api",
      from: "handler",
      to: "store-client",
    });
    expect(hopView(index, steps[2] as never)).toMatchObject({ scope: null, from: "api", to: "db" });
    expect(hopView(index, steps[3] as never)).toMatchObject({
      scope: "worker",
      from: "mailer",
      to: "unknown:carrier",
    });
  });

  it("does not throw for a step naming an undeclared part", () => {
    const step = {
      from: "page-a",
      to: "nowhere",
      verb: "calls",
      caption: "",
      connection: null,
      gap: "x",
    } as const;
    expect(hopView(index, step)).toMatchObject({ scope: "web", from: "page-a", to: null });
  });
});

describe("layout continuity", () => {
  const cached: CachedLayout = {
    width: 800,
    height: 400,
    nodes: { a: { x: 0, y: 0, w: 200, h: 80 }, b: { x: 400, y: 0, w: 200, h: 80 } },
    routes: {
      "a->b": [
        [200, 40],
        [400, 40],
      ],
    },
  };

  it("reuses a cached layout when nothing changed", () => {
    const result = reconcileLayout(cached, ["a", "b"], [{ key: "a->b", from: "a", to: "b" }], {
      w: 200,
      h: 80,
    });
    expect(result?.layout).toEqual(cached);
    expect(result?.placed).toEqual([]);
  });

  it("places a new part into free space without moving unchanged parts", () => {
    const result = reconcileLayout(
      cached,
      ["a", "b", "c"],
      [
        { key: "a->b", from: "a", to: "b" },
        { key: "b->c", from: "b", to: "c" },
      ],
      { w: 200, h: 80 },
    );
    expect(result?.layout.nodes.a).toEqual(cached.nodes.a);
    expect(result?.layout.nodes.b).toEqual(cached.nodes.b);
    expect(result?.placed).toEqual(["c"]);
    const c = result?.layout.nodes.c as { x: number; y: number };
    const overlaps = (p: { x: number; y: number; w: number; h: number }) =>
      c.x < p.x + p.w && c.x + 200 > p.x && c.y < p.y + p.h && c.y + 80 > p.y;
    expect(overlaps(cached.nodes.a as never)).toBe(false);
    expect(overlaps(cached.nodes.b as never)).toBe(false);
    expect(result?.layout.routes["b->c"]?.length).toBeGreaterThanOrEqual(2);
    expect(result?.layout.routes["a->b"]).toEqual(cached.routes["a->b"]);
  });

  it("keeps the hole when a part goes away", () => {
    const result = reconcileLayout(cached, ["a"], [], { w: 200, h: 80 });
    expect(result?.layout.nodes.a).toEqual(cached.nodes.a);
    expect(result?.layout.nodes.b).toBeUndefined();
    expect(result?.layout.routes["a->b"]).toBeUndefined();
  });

  it("asks for an explicit rearrangement rather than sprawling", () => {
    const ids = ["a", "b", ...Array.from({ length: 40 }, (_, i) => `n${i}`)];
    expect(reconcileLayout(cached, ids, [], { w: 200, h: 80 })).toBeNull();
  });
});

describe("routes", () => {
  it("cuts corners at 45 degrees so lines read like a metro map", () => {
    const route = chamferRoute(
      [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      20,
    );
    expect(route).toEqual([
      [0, 0],
      [80, 0],
      [100, 20],
      [100, 100],
    ]);
  });

  it("never cuts past the middle of a short segment", () => {
    expect(
      chamferRoute(
        [
          [0, 0],
          [10, 0],
          [10, 100],
        ],
        20,
      ),
    ).toEqual([
      [0, 0],
      [5, 0],
      [10, 5],
      [10, 100],
    ]);
  });

  it("leaves straight routes alone", () => {
    expect(
      chamferRoute(
        [
          [0, 0],
          [100, 0],
        ],
        20,
      ),
    ).toEqual([
      [0, 0],
      [100, 0],
    ]);
  });
});

describe("labels", () => {
  it("keeps Latin text and replaces what the bundled font cannot draw", () => {
    expect(safeLabel("Orders API — v2")).toBe("Orders API — v2");
    expect(safeLabel("注文 API")).toBe("?? API");
  });

  it("shortens to fit a part box", () => {
    expect(safeLabel("A very long part name that overflows the box", 20)).toBe(
      "A very long part na…",
    );
  });
});

describe("cutaway frames", () => {
  const layouts: Record<string, CachedLayout> = {
    root: { width: 1000, height: 600, nodes: { a: { x: 400, y: 200, w: 200, h: 80 } }, routes: {} },
    a: { width: 800, height: 400, nodes: {}, routes: {} },
  };
  const keyOf = (scope: string | null) => scope ?? "root";

  it("opens a part in place, smaller than its surroundings", () => {
    const frames = computeFrames(layouts, [null, "a"], keyOf);
    const [root, frame] = frames as [Frame, Frame];
    expect(root.scale).toBe(1);
    expect(frame.rect.cx).toBe(500);
    expect(frame.rect.cy).toBe(-240);
    expect(frame.scale).toBeLessThan(1);
    expect(frame.rect.w).toBeLessThan(1000);
  });

  it("stops at a scope whose layout is not ready", () => {
    expect(computeFrames(layouts, [null, "a", "missing"], keyOf)).toHaveLength(2);
    expect(computeFrames({}, [null], keyOf)).toEqual([]);
  });

  it("zooms in further for a cutaway than for the whole map", () => {
    const [root, frame] = computeFrames(layouts, [null, "a"], keyOf) as [Frame, Frame];
    const viewport = { width: 1200, height: 900 };
    expect(fitZoom(frame.rect, viewport, 1.12)).toBeGreaterThan(fitZoom(root.rect, viewport, 1.1));
  });
});

describe("status sentence", () => {
  it("answers what this is, what changed, and what is unknown", () => {
    expect(statusSentence(index)).toBe(
      "10 parts in 1 repo · since main: 3 parts changed, 1 with an agent trailer · 1 unknown link",
    );
  });

  it("counts repositories even when no comparison rows exist", () => {
    const graph = testGraph();
    graph.comparison.repos = [];
    expect(statusSentence(indexGraph(graph))).toMatch(/^10 parts in 1 repo/);
  });

  it("says when no comparison exists instead of implying nothing changed", () => {
    const graph = testGraph();
    graph.comparison.parts = [];
    (graph.comparison.repos[0] as { status: string }).status = "unavailable";
    expect(statusSentence(indexGraph(graph))).toContain("comparison unavailable");
  });
});

describe("M1: reopening a trail", () => {
  const trail = (targets: { part: string; fingerprint: string | null }[]): Trail => ({
    version: 1,
    id: "t",
    title: "T",
    question: "",
    finding: null,
    author: null,
    snapshot: { graphDigest: "d", repos: [{ repo: "r", head: "abc1234567", stateId: "s1" }] },
    steps: [
      {
        eye: "atlas",
        scope: null,
        selected: null,
        flow: null,
        flowStep: null,
        query: null,
        note: "",
        targets,
      },
    ],
  });

  it("captures the viewed part with its fingerprint", () => {
    expect(captureTargets(index, "deep", null)).toEqual([{ part: "deep", fingerprint: "fp-deep" }]);
  });

  it("reports no change when fingerprints match", () => {
    const report = compareTrail(trail([{ part: "deep", fingerprint: "fp-deep" }]), index);
    expect(report.targets[0]?.status).toBe("unchanged");
    expect(report.repos[0]?.status).toBe("same");
  });

  it("identifies changed and removed targets", () => {
    const report = compareTrail(
      trail([
        { part: "deep", fingerprint: "old" },
        { part: "gone", fingerprint: "x" },
      ]),
      index,
    );
    expect(report.targets.map((t) => t.status)).toEqual(["changed", "removed"]);
  });

  it("notices a different local state on the same commit", () => {
    const graph = testGraph();
    (graph.repos[0] as { stateId: string }).stateId = "s2";
    const report = compareTrail(trail([]), indexGraph(graph));
    expect(report.repos[0]).toMatchObject({ status: "changed", sameCommit: true });
  });

  it("reports missing evidence as unavailable, never as unchanged", () => {
    const report = compareTrail(trail([{ part: "deep", fingerprint: null }]), index);
    expect(report.targets[0]?.status).toBe("unavailable");
    const missingRepo = trail([]);
    missingRepo.snapshot.repos = [{ repo: "other", head: null, stateId: null }];
    expect(compareTrail(missingRepo, index).repos[0]?.status).toBe("unavailable");
  });
});

describe("keeps the graph helpers honest", () => {
  it("builds an index for a graph with a connection to a removed part", () => {
    const graph = testGraph({ connections: [link("web", "missing")] });
    expect(() => scopeGraph(indexGraph(graph), null)).not.toThrow();
  });
});
