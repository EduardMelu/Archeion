// Layout per scope, reused across eye changes and repeat visits. A cached scope only grows through
// the continuity policy; ELK runs again only on first sight or an explicit rearrangement.
import { cacheDelete, cacheGet, cachePut } from "../data/idb";
import { type GraphIndex, type ScopeGraph, scopeGraph } from "../logic/graphIndex";
import { type CachedLayout, type LayoutEdge, reconcileLayout } from "../logic/layoutPolicy";
import { scopeKey, useStore } from "../store";

export const PART_SIZE = { w: 216, h: 76 };

/** Boxes fit their names, within limits, so fewer labels need cutting. */
function nodeSize(index: GraphIndex, node: ScopeGraph["nodes"][number]) {
  const length = index.parts.get(node.part)?.name.length ?? 0;
  return node.type === "stub"
    ? { w: Math.min(190, Math.max(104, length * 7.4 + 28)), h: 34 }
    : { w: Math.min(300, Math.max(200, length * 12.5 + 28)), h: PART_SIZE.h };
}

export interface LayoutRequest {
  id: number;
  nodes: { id: string; w: number; h: number }[];
  edges: LayoutEdge[];
}

export interface LayoutResponse {
  id: number;
  layout: CachedLayout;
}

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, (layout: CachedLayout) => void>();

function runElk(index: GraphIndex, graph: ScopeGraph): Promise<CachedLayout> {
  worker ??= (() => {
    const created = new Worker(new URL("./elk.worker.ts", import.meta.url), { type: "module" });
    created.onmessage = ({ data }: MessageEvent<LayoutResponse>) => {
      pending.get(data.id)?.(data.layout);
      pending.delete(data.id);
    };
    return created;
  })();
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    const request: LayoutRequest = {
      id,
      nodes: graph.nodes.map((node) => ({ id: node.id, ...nodeSize(index, node) })),
      edges: graph.edges.map(({ key, from, to }) => ({ key, from, to })),
    };
    worker?.postMessage(request);
  });
}

// Bump when node sizes or routing options change, so older cached positions are not reused.
const LAYOUT_VERSION = 4;
const cacheKey = (workspace: string, scope: string | null) =>
  `v${LAYOUT_VERSION}|${workspace}|${scopeKey(scope)}`;

async function layoutScope(index: GraphIndex, scope: string | null): Promise<void> {
  const graph = scopeGraph(index, scope);
  const { setLayout } = useStore.getState();
  const key = cacheKey(index.graph.workspace.id, scope);
  const cached = await cacheGet<CachedLayout>("layouts", key);
  if (cached) {
    const ids = graph.nodes.map((n) => n.id);
    const parts = ids.filter((id) => !id.startsWith("stub:"));
    const keep = reconcileLayout(cached, ids, graph.edges, PART_SIZE);
    if (keep) {
      setLayout(
        scopeKey(scope),
        keep.layout,
        keep.placed.filter((id) => parts.includes(id)),
      );
      if (keep.placed.length > 0) await cachePut("layouts", key, keep.layout);
      return;
    }
    // No free space left: keep every known part where it is and let the owner ask for a new
    // arrangement, rather than rearranging on their behalf.
    const crowded = reconcileLayout(cached, ids, graph.edges, PART_SIZE, Number.POSITIVE_INFINITY);
    if (crowded) {
      setLayout(
        scopeKey(scope),
        crowded.layout,
        crowded.placed.filter((id) => parts.includes(id)),
      );
      return;
    }
  }
  const layout = await runElk(index, graph);
  setLayout(scopeKey(scope), layout, []);
  await cachePut("layouts", key, layout);
}

/** Lays out every scope once, in the worker, so opening a part never waits on layout. */
export async function layoutAllScopes(index: GraphIndex): Promise<void> {
  await layoutScope(index, null);
  const scopes = index.graph.parts.filter((p) => p.hasInside).map((p) => p.id);
  await Promise.all(scopes.map((scope) => layoutScope(index, scope)));
}

/** The explicit rearrangement: the only way cached positions are ever replaced. */
export async function rearrange(index: GraphIndex, scope: string | null): Promise<void> {
  await cacheDelete("layouts", cacheKey(index.graph.workspace.id, scope));
  const layout = await runElk(index, scopeGraph(index, scope));
  useStore.getState().setLayout(scopeKey(scope), layout, []);
  await cachePut("layouts", cacheKey(index.graph.workspace.id, scope), layout);
}
