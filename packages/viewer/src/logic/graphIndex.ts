import type { Connection, Diagnostic, Graph, Part, PartChange } from "@archeion/core/contracts";

export interface GraphIndex {
  graph: Graph;
  parts: Map<string, Part>;
  children: Map<string | null, Part[]>;
  connections: Map<string, Connection>;
  changes: Map<string, PartChange>;
  diagnostics: Map<string, Diagnostic[]>;
}

export function indexGraph(graph: Graph): GraphIndex {
  const children = new Map<string | null, Part[]>();
  for (const part of graph.parts) {
    const siblings = children.get(part.parent);
    if (siblings) siblings.push(part);
    else children.set(part.parent, [part]);
  }
  const diagnostics = new Map<string, Diagnostic[]>();
  for (const diagnostic of graph.diagnostics) {
    if (!diagnostic.part) continue;
    diagnostics.set(diagnostic.part, [...(diagnostics.get(diagnostic.part) ?? []), diagnostic]);
  }
  return {
    graph,
    parts: new Map(graph.parts.map((p) => [p.id, p])),
    children,
    connections: new Map(graph.connections.map((c) => [c.id, c])),
    changes: new Map(graph.comparison.parts.map((c) => [c.part, c])),
    diagnostics,
  };
}

/** Root-first containment path, ending with the part itself. */
export function pathTo(index: GraphIndex, id: string): string[] {
  const path: string[] = [];
  for (let at: string | null = id; at; at = index.parts.get(at)?.parent ?? null) {
    if (!index.parts.has(at)) break;
    path.unshift(at);
  }
  return path;
}

/** The child of `scope` that contains `id`, or null when `id` lies outside the scope. */
export function visibleIn(index: GraphIndex, scope: string | null, id: string): string | null {
  let at: string | null = id;
  while (at) {
    const part = index.parts.get(at);
    if (!part) return null;
    if (part.parent === scope) return at;
    at = part.parent;
  }
  return null;
}

/** The deepest scope in which both parts are visible as distinct children. */
export function lowestCommonScope(index: GraphIndex, a: string, b: string): string | null {
  const left = pathTo(index, a);
  const right = pathTo(index, b);
  let scope: string | null = null;
  for (let i = 0; i < left.length && left[i] === right[i]; i++) scope = left[i] as string;
  return scope;
}

export interface ScopeNode {
  id: string;
  type: "part" | "stub";
  /** The part drawn, or the outside neighbour a stub stands for. */
  part: string;
}

export interface ScopeEdge {
  key: string;
  from: string;
  to: string;
  connections: string[];
  unknown: boolean;
}

export interface ScopeGraph {
  nodes: ScopeNode[];
  edges: ScopeEdge[];
}

/** The outside part a cutaway names: the one visible in the surroundings of the scope. */
function outsideRepresentative(index: GraphIndex, scope: string, id: string): string {
  const chain = new Set(pathTo(index, scope));
  let at = id;
  for (;;) {
    const parent: string | null = index.parts.get(at)?.parent ?? null;
    if (parent === null || chain.has(parent)) return at;
    at = parent;
  }
}

export function scopeGraph(index: GraphIndex, scope: string | null): ScopeGraph {
  const nodes = new Map<string, ScopeNode>();
  for (const part of index.children.get(scope) ?? []) {
    nodes.set(part.id, { id: part.id, type: "part", part: part.id });
  }
  const edges = new Map<string, ScopeEdge>();
  for (const connection of index.graph.connections) {
    if (!index.parts.has(connection.from) || !index.parts.has(connection.to)) continue;
    const from = visibleIn(index, scope, connection.from);
    const to = visibleIn(index, scope, connection.to);
    let edgeFrom = from;
    let edgeTo = to;
    if (from && to) {
      if (from === to) continue;
    } else if (scope !== null && from && connection.to !== scope) {
      const outside = outsideRepresentative(index, scope, connection.to);
      edgeTo = `stub:out:${outside}`;
      nodes.set(edgeTo, { id: edgeTo, type: "stub", part: outside });
    } else if (scope !== null && to && connection.from !== scope) {
      const outside = outsideRepresentative(index, scope, connection.from);
      edgeFrom = `stub:in:${outside}`;
      nodes.set(edgeFrom, { id: edgeFrom, type: "stub", part: outside });
    } else {
      continue;
    }
    const key = `${edgeFrom}->${edgeTo}`;
    const unknown =
      connection.resolution === "unknown" || index.parts.get(connection.to)?.kind === "unknown";
    const edge = edges.get(key);
    if (edge) {
      edge.connections.push(connection.id);
      edge.unknown &&= unknown;
    } else {
      edges.set(key, {
        key,
        from: edgeFrom as string,
        to: edgeTo as string,
        connections: [connection.id],
        unknown,
      });
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
