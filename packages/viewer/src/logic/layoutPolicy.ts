// Continuity policy: a cached scope never rearranges by itself. New parts take free space;
// when there is none, the caller offers an explicit rearrangement instead of moving things.
export type Point = [number, number];

export interface NodeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CachedLayout {
  width: number;
  height: number;
  nodes: Record<string, NodeBox>;
  routes: Record<string, Point[]>;
}

export interface LayoutEdge {
  key: string;
  from: string;
  to: string;
}

const GAP = 24;
const GROWTH_LIMIT = 1.5;

function elbow(from: NodeBox, to: NodeBox): Point[] {
  const start: Point = [from.x + from.w, from.y + from.h / 2];
  const end: Point = [to.x, to.y + to.h / 2];
  if (start[1] === end[1]) return [start, end];
  const middle = (start[0] + end[0]) / 2;
  return [start, [middle, start[1]], [middle, end[1]], end];
}

/** Returns null when new parts cannot fit without moving others. */
export function reconcileLayout(
  cached: CachedLayout,
  nodeIds: string[],
  edges: LayoutEdge[],
  size: { w: number; h: number },
  growthLimit = GROWTH_LIMIT,
): { layout: CachedLayout; placed: string[] } | null {
  const wanted = new Set(nodeIds);
  const nodes: Record<string, NodeBox> = {};
  for (const [id, box] of Object.entries(cached.nodes)) if (wanted.has(id)) nodes[id] = box;

  const placed: string[] = [];
  const free = (x: number, y: number) =>
    Object.values(nodes).every(
      (box) =>
        x + size.w + GAP <= box.x ||
        x >= box.x + box.w + GAP ||
        y + size.h + GAP <= box.y ||
        y >= box.y + box.h + GAP,
    );
  const maxX = Math.max(cached.width, size.w) * Math.min(growthLimit, GROWTH_LIMIT) - size.w;
  const maxY = Math.max(cached.height, size.h) * growthLimit - size.h;
  for (const id of nodeIds) {
    if (nodes[id]) continue;
    let spot: Point | null = null;
    for (let y = 0; y <= maxY && !spot; y += size.h + GAP) {
      for (let x = 0; x <= maxX && !spot; x += size.w + GAP) {
        if (free(x, y)) spot = [x, y];
      }
    }
    if (!spot) return null;
    nodes[id] = { x: spot[0], y: spot[1], w: size.w, h: size.h };
    placed.push(id);
  }

  const routes: Record<string, Point[]> = {};
  for (const edge of edges) {
    const from = nodes[edge.from];
    const to = nodes[edge.to];
    if (!from || !to) continue;
    routes[edge.key] = cached.routes[edge.key] ?? elbow(from, to);
  }

  const boxes = Object.values(nodes);
  return {
    layout: {
      width: Math.max(cached.width, ...boxes.map((b) => b.x + b.w)),
      height: Math.max(cached.height, ...boxes.map((b) => b.y + b.h)),
      nodes,
      routes,
    },
    placed,
  };
}
