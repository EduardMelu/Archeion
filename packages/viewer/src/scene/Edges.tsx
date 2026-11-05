import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import type { Point } from "../logic/layoutPolicy";
import { chamferRoute, ribbon } from "../logic/route";
import { ribbonMaterial, setColor, stationMaterial } from "./materials";
import { approach, tokenState } from "./motion";
import type { SceneTheme } from "./theme";

export type EdgeTone = "quiet" | "dim" | "context" | "focus";

const CORNER = 18;
const STATION_RADIUS = 6.5;
const TONE_ALPHA: Record<EdgeTone, number> = { quiet: 1, context: 1, focus: 1, dim: 0.22 };

function ribbonGeometry(points: Point[], start: number, end: number): BufferGeometry {
  const data = ribbon(points, start, end);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
  geometry.setAttribute("aLine", new BufferAttribute(data.lineCoords, 2));
  geometry.setAttribute("aDistance", new BufferAttribute(data.distances, 1));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  return geometry;
}

/** Layout routes run in layout space, with y down; the scene's y points up. */
export const toWorld = (route: Point[]): Point[] => route.map(([x, y]): Point => [x, -y]);

export const EdgeRibbon = memo(function EdgeRibbon(props: {
  edgeKey: string;
  route: Point[];
  tone: EdgeTone;
  dashed: boolean;
  main: boolean;
  /** "passed" stays dyed; "current" follows the token. */
  dye: "none" | "passed" | "current";
  theme: SceneTheme;
  layer: { value: number };
  order: number;
  onSelect: ((key: string) => void) | null;
}) {
  const { route, tone, dye, theme, layer, order, main, dashed, edgeKey, onSelect } = props;
  const invalidate = useThree((state) => state.invalidate);
  const material = useMemo(() => ribbonMaterial(layer), [layer]);
  const shape = useMemo(() => chamferRoute(toWorld(route), CORNER), [route]);
  const geometry = useMemo(() => ribbonGeometry(shape, main ? 7 : 5.5, 2.8), [shape, main]);
  const hit = useMemo(() => (onSelect ? ribbonGeometry(shape, 16, 16) : null), [shape, onSelect]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => hit?.dispose(), [hit]);

  const u = material.uniforms as Record<string, { value: number }>;
  const current = useRef({ alpha: TONE_ALPHA[tone], focus: tone === "focus" ? 1 : 0 });

  useLayoutEffect(() => {
    // Lines carry the map, so they use the brighter of the two line tokens. Cross-repository lines
    // read stronger through width, and the focus through colour.
    setColor(material, "uBase", main ? theme.resource : theme.lineMain);
    setColor(material, "uFocusColor", theme.accent);
    (u.uGlow as { value: number }).value = theme.glow;
    (u.uDashed as { value: number }).value = dashed ? 1 : 0;
    invalidate();
  }, [material, u, theme, dashed, main, invalidate]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tone and dye are wake-up triggers.
  useEffect(() => invalidate(), [tone, dye, invalidate]);

  useFrame((_state, delta) => {
    const c = current.current;
    const alpha = TONE_ALPHA[tone];
    const focus = tone === "focus" ? 1 : 0;
    c.alpha = approach(c.alpha, alpha, delta);
    c.focus = approach(c.focus, focus, delta);
    (u.uAlpha as { value: number }).value = c.alpha;
    (u.uFocus as { value: number }).value = c.focus;
    (u.uProgress as { value: number }).value =
      dye === "passed"
        ? 1.01
        : dye === "current"
          ? tokenState.edge === edgeKey
            ? tokenState.progress
            : -0.01
          : -0.01;
    if (c.alpha !== alpha || c.focus !== focus) invalidate();
  });

  return (
    <>
      <mesh geometry={geometry} material={material} renderOrder={order} raycast={() => null} />
      {hit && onSelect ? (
        <mesh
          geometry={hit}
          visible={false}
          onClick={(event: ThreeEvent<MouseEvent>) => {
            if (event.delta > 4) return;
            event.stopPropagation();
            onSelect(edgeKey);
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        />
      ) : null}
    </>
  );
});

/** Where lines meet a part: one merged mesh per scope, so stations add a single draw call. */
export const Stations = memo(function Stations(props: {
  routes: Point[][];
  theme: SceneTheme;
  fill: string;
  dim: boolean;
  layer: { value: number };
  order: number;
}) {
  const { routes, theme, fill, dim, layer, order } = props;
  const invalidate = useThree((state) => state.invalidate);
  const material = useMemo(() => stationMaterial(layer), [layer]);
  const geometry = useMemo(() => {
    const points = new Map<string, Point>();
    for (const route of routes) {
      for (const end of [route[0], route.at(-1)]) {
        if (end) points.set(`${Math.round(end[0])}|${Math.round(end[1])}`, end);
      }
    }
    const positions: number[] = [];
    const offsets: number[] = [];
    const indices: number[] = [];
    let count = 0;
    for (const [x, y] of points.values()) {
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        positions.push(x + dx * STATION_RADIUS, -y + dy * STATION_RADIUS, 0);
        offsets.push(dx, dy);
      }
      indices.push(count, count + 1, count + 2, count, count + 2, count + 3);
      count += 4;
    }
    const built = new BufferGeometry();
    built.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    built.setAttribute("aOffset", new BufferAttribute(new Float32Array(offsets), 2));
    built.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
    return built;
  }, [routes]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  const u = material.uniforms as Record<string, { value: number }>;
  const alpha = useRef(dim ? 0.28 : 1);

  useLayoutEffect(() => {
    setColor(material, "uRing", theme.lineMain);
    setColor(material, "uFill", fill);
    invalidate();
  }, [material, theme, fill, invalidate]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dim is a wake-up trigger.
  useEffect(() => invalidate(), [dim, invalidate]);

  useFrame((_state, delta) => {
    const target = dim ? 0.28 : 1;
    alpha.current = approach(alpha.current, target, delta);
    (u.uAlpha as { value: number }).value = alpha.current;
    if (alpha.current !== target) invalidate();
  });

  return <mesh geometry={geometry} material={material} renderOrder={order} raycast={() => null} />;
});
