// Cutaway geometry. A scope opens in place: its frame is centred on the part's own box, and its
// children are drawn smaller inside it, so zooming in is one continuous space.
import type { CachedLayout, NodeBox } from "./layoutPolicy";

export interface Rect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface Frame {
  scope: string | null;
  /** World position of the layout's origin, and its scale. World y points up. */
  ox: number;
  oy: number;
  scale: number;
  /** The frame in world space; for the root, the extent of the whole map. */
  rect: Rect;
  /** The part's box the frame opened from, in world space. */
  box: Rect | null;
}

export const FRAME_PAD = 56;
export const FRAME_TOP = 56;
const MAX_CHILD_SCALE = 0.56;
const FRAME_SHARE = 0.72;

export function worldBox(frame: Frame, box: NodeBox): Rect {
  return {
    cx: frame.ox + (box.x + box.w / 2) * frame.scale,
    cy: frame.oy - (box.y + box.h / 2) * frame.scale,
    w: box.w * frame.scale,
    h: box.h * frame.scale,
  };
}

/** Root-first frames along `path`, stopping at the first scope whose layout is not ready. */
export function computeFrames(
  layouts: Record<string, CachedLayout>,
  path: (string | null)[],
  keyOf: (scope: string | null) => string,
): Frame[] {
  const frames: Frame[] = [];
  for (const scope of path) {
    const layout = layouts[keyOf(scope)];
    if (!layout) break;
    const parent = frames.at(-1);
    if (!parent) {
      frames.push({
        scope,
        ox: 0,
        oy: 0,
        scale: 1,
        rect: { cx: layout.width / 2, cy: -layout.height / 2, w: layout.width, h: layout.height },
        box: null,
      });
      continue;
    }
    const parentLayout = layouts[keyOf(parent.scope)] as CachedLayout;
    const nodeBox = parentLayout.nodes[scope as string];
    if (!nodeBox) break;
    const box = worldBox(parent, nodeBox);
    const innerW = layout.width + FRAME_PAD * 2;
    const innerH = layout.height + FRAME_PAD + FRAME_TOP;
    const fit = Math.min(
      MAX_CHILD_SCALE,
      (FRAME_SHARE * parent.rect.w) / (innerW * parent.scale),
      (FRAME_SHARE * parent.rect.h) / (innerH * parent.scale),
    );
    const scale = parent.scale * fit;
    const w = innerW * scale;
    const h = innerH * scale;
    frames.push({
      scope,
      ox: box.cx - w / 2 + FRAME_PAD * scale,
      oy: box.cy + h / 2 - FRAME_TOP * scale,
      scale,
      rect: { cx: box.cx, cy: box.cy, w, h },
      box,
    });
  }
  return frames;
}

/** The camera zoom that fits a rectangle, leaving the surroundings visible around a cutaway. */
export function fitZoom(
  rect: Rect,
  viewport: { width: number; height: number },
  margin: number,
): number {
  return Math.min(viewport.width / (rect.w * margin), viewport.height / (rect.h * margin));
}
