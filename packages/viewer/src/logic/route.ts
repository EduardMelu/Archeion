import type { Point } from "./layoutPolicy";

/** Cuts each corner at 45 degrees, the signature of the metro-map lines. */
export function chamferRoute(points: Point[], radius: number): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [points[0] as Point];
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1] as Point;
    const [x, y] = points[i] as Point;
    const [nx, ny] = points[i + 1] as Point;
    const before = Math.hypot(x - px, y - py);
    const after = Math.hypot(nx - x, ny - y);
    if (before === 0 || after === 0) continue;
    const cut = Math.min(radius, before / 2, after / 2);
    out.push([x - ((x - px) / before) * cut, y - ((y - py) / before) * cut]);
    out.push([x + ((nx - x) / after) * cut, y + ((ny - y) / after) * cut]);
  }
  out.push(points[points.length - 1] as Point);
  return out;
}

export function routeLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1] as Point;
    const [bx, by] = points[i] as Point;
    total += Math.hypot(bx - ax, by - ay);
  }
  return total;
}

/** The point a fraction of the way along a route. */
export function pointAlong(points: Point[], fraction: number): Point {
  const target = routeLength(points) * Math.min(1, Math.max(0, fraction));
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1] as Point;
    const [bx, by] = points[i] as Point;
    const length = Math.hypot(bx - ax, by - ay);
    if (walked + length >= target && length > 0) {
      const t = (target - walked) / length;
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    }
    walked += length;
  }
  return points[points.length - 1] as Point;
}

export interface RibbonData {
  positions: Float32Array;
  /** x: -1 to 1 across the line; y: 0 to 1 along it. */
  lineCoords: Float32Array;
  /** Distance along the line in layout units, for dashes that keep their spacing. */
  distances: Float32Array;
  indices: Uint16Array;
}

/** A tapered ribbon: wide at the source and narrow at the target, so direction reads at a glance. */
export function ribbon(points: Point[], startWidth: number, endWidth: number): RibbonData {
  const count = points.length;
  const positions = new Float32Array(count * 6);
  const lineCoords = new Float32Array(count * 4);
  const distances = new Float32Array(count * 2);
  const indices = new Uint16Array(Math.max(0, count - 1) * 6);
  const total = routeLength(points) || 1;
  let walked = 0;

  for (let i = 0; i < count; i++) {
    const [x, y] = points[i] as Point;
    const [px, py] = points[Math.max(0, i - 1)] as Point;
    const [nx, ny] = points[Math.min(count - 1, i + 1)] as Point;
    if (i > 0) walked += Math.hypot(x - px, y - py);

    const inLength = Math.hypot(x - px, y - py) || 1;
    const outLength = Math.hypot(nx - x, ny - y) || 1;
    const inDir: Point = [(x - px) / inLength, (y - py) / inLength];
    const outDir: Point = [(nx - x) / outLength, (ny - y) / outLength];
    const tangent: Point =
      i === 0 ? outDir : i === count - 1 ? inDir : [inDir[0] + outDir[0], inDir[1] + outDir[1]];
    const tangentLength = Math.hypot(tangent[0], tangent[1]) || 1;
    const normalX = -tangent[1] / tangentLength;
    const normalY = tangent[0] / tangentLength;
    // Miter so the ribbon keeps its width through the join.
    const miter =
      i === 0 || i === count - 1
        ? 1
        : Math.min(1.6, 1 / Math.max(0.2, normalX * -inDir[1] + normalY * inDir[0]));
    const t = walked / total;
    const half = ((startWidth + (endWidth - startWidth) * t) / 2) * miter;

    positions.set(
      [x + normalX * half, y + normalY * half, 0, x - normalX * half, y - normalY * half, 0],
      i * 6,
    );
    lineCoords.set([-1, t, 1, t], i * 4);
    distances.set([walked, walked], i * 2);
    if (i < count - 1) {
      const a = i * 2;
      indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
  }
  return { positions, lineCoords, distances, indices };
}
