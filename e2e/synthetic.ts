// Generates the performance fixture: about 500 total parts, with one bounded stress view of at
// least 30 nodes and 60 connections. Built directly against the graph contract.
import {
  type Connection,
  GRAPH_VERSION,
  type Graph,
  type Part,
} from "../packages/core/src/contracts.ts";

function part(id: string, parent: string | null, extra: Partial<Part> = {}): Part {
  return {
    id,
    parent,
    name: id.replaceAll("-", " "),
    kind: "module",
    does: `Synthetic part ${id}`,
    about: null,
    tech: "synthetic",
    owner: null,
    hasInside: false,
    repos: ["synthetic"],
    code: [],
    rules: [],
    reuse: [],
    topics: [],
    resource: null,
    dependencies: [],
    evidence: [],
    provenance: "reviewed",
    fingerprint: `fp-${id}`,
    ...extra,
  };
}

function link(from: string, to: string): Connection {
  return {
    id: `${from}|calls|${to}`,
    from,
    to,
    verb: "calls",
    via: null,
    provenance: "reviewed",
    resolution: "resolved",
    reason: null,
    crossRepo: false,
    evidence: [],
  };
}

export const STRESS_SCOPE = "stress-domain";
export const STRESS_NODES = 32;
export const STRESS_CONNECTIONS = 64;

export function syntheticGraph(): Graph {
  const parts: Part[] = [];
  const connections: Connection[] = [];

  // Nine ordinary domains of about 50 parts each, in three levels.
  for (let d = 0; d < 9; d++) {
    const domain = `domain-${d}`;
    parts.push(part(domain, null, { hasInside: true, kind: "system" }));
    for (let s = 0; s < 7; s++) {
      const service = `d${d}-service-${s}`;
      parts.push(part(service, domain, { hasInside: true, kind: "service" }));
      for (let m = 0; m < 6; m++) parts.push(part(`d${d}-s${s}-module-${m}`, service));
      for (let m = 0; m < 5; m++)
        connections.push(link(`d${d}-s${s}-module-${m}`, `d${d}-s${s}-module-${m + 1}`));
      if (s > 0) connections.push(link(`d${d}-service-${s - 1}`, service));
    }
    if (d > 0) connections.push(link(`domain-${d - 1}`, domain));
  }

  // The bounded stress view: a dense layered graph that stays inside one scope.
  parts.push(part(STRESS_SCOPE, null, { hasInside: true, kind: "system", name: "Stress view" }));
  connections.push(link("domain-0", STRESS_SCOPE));
  const layers = 4;
  const perLayer = STRESS_NODES / layers;
  const id = (layer: number, i: number) => `stress-${layer}-${i}`;
  for (let layer = 0; layer < layers; layer++) {
    for (let i = 0; i < perLayer; i++) parts.push(part(id(layer, i), STRESS_SCOPE));
  }
  let added = 0;
  for (let layer = 0; layer < layers - 1 && added < STRESS_CONNECTIONS; layer++) {
    for (let i = 0; i < perLayer && added < STRESS_CONNECTIONS; i++) {
      for (const offset of [0, 1, 3]) {
        if (added >= STRESS_CONNECTIONS) break;
        connections.push(link(id(layer, i), id(layer + 1, (i + offset) % perLayer)));
        added++;
      }
    }
  }

  const steps = [
    ["stress-0-0", "stress-1-0"],
    ["stress-1-0", "stress-2-0"],
    ["stress-2-0", "stress-3-0"],
  ] as const;

  return {
    version: GRAPH_VERSION,
    workspace: { id: "synthetic", name: "Synthetic 500 parts" },
    repos: [
      { id: "synthetic", name: "Synthetic", git: false, head: null, branch: null, stateId: null },
    ],
    parts: parts.sort((a, b) => (a.id < b.id ? -1 : 1)),
    connections: connections.sort((a, b) => (a.id < b.id ? -1 : 1)),
    flows: [
      {
        id: "stress-flow",
        name: "Stress flow",
        does: "",
        evidence: [],
        steps: steps.map(([from, to], i) => ({
          from,
          to,
          verb: "calls" as const,
          caption: `Hop ${i + 1}`,
          connection: `${from}|calls|${to}`,
          gap: null,
        })),
      },
    ],
    coverage: [],
    comparison: {
      repos: [],
      files: [],
      commits: [],
      dependencies: [],
      parts: [],
      removedParts: [],
    },
    trails: [],
    diagnostics: [],
  };
}
