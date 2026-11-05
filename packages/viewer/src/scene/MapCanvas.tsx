import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Color, type Group, HalfFloatType, type Mesh, type OrthographicCamera } from "three";
import { partVisuals, triage } from "../logic/emphasis";
import { computeFrames, type Frame, fitZoom, type Rect, worldBox } from "../logic/frames";
import { type GraphIndex, scopeGraph } from "../logic/graphIndex";
import type { Point } from "../logic/layoutPolicy";
import { chamferRoute, pointAlong } from "../logic/route";
import { dyedEdges, hopView } from "../logic/tracer";
import { scopeKey, scopePath, useStore } from "../store";
import { cameraControl } from "./control";
import { toWorld } from "./Edges";
import { MapGrid } from "./MapGrid";
import {
  debugEnabled,
  easeInOut,
  frameDelta,
  motion,
  QUALITY_LEVELS,
  tokenState,
  useQuality,
} from "./motion";
import { type SceneModel, ScopeLayer } from "./ScopeLayer";
import { sceneTheme } from "./theme";

const ROOT_MARGIN = 1.1;
const SCOPE_MARGIN = 1.12;
const MIN_READABLE_SCALE = 0.5;
const FLIGHT_SECONDS = 0.72;
const HOP_SECONDS = 1.15;
const DWELL_SECONDS = 0.85;
const REDUCED_DWELL_SECONDS = 2;

function useActiveFrames(index: GraphIndex | null, scope: string | null) {
  const layouts = useStore((s) => s.layouts);
  return useMemo(
    () => (index ? computeFrames(layouts, scopePath(index, scope), scopeKey) : []),
    [index, scope, layouts],
  );
}

function CameraRig() {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const index = useStore((s) => s.index);
  const scope = useStore((s) => s.scope);
  const frames = useActiveFrames(index, scope);
  const frame = frames.at(-1);
  const lower = useQuality((s) => s.lower);

  const flight = useRef<{
    fromX: number;
    fromY: number;
    fromZoom: number;
    toX: number;
    toY: number;
    toZoom: number;
    t: number;
  } | null>(null);
  const placed = useRef(false);
  const appliedScope = useRef<string | null | undefined>(undefined);
  const baseZoom = useRef(1);
  const samples = useRef<number[]>([]);
  const skipSamples = useRef(0);

  const target = useMemo(() => {
    if (!frame) return null;
    const margin = frame.scope ? SCOPE_MARGIN : ROOT_MARGIN;
    // On a very narrow window the map is panned rather than shrunk past reading.
    const zoom = Math.max(fitZoom(frame.rect, size, margin), MIN_READABLE_SCALE / frame.scale);
    return { rect: frame.rect, zoom };
  }, [frame, size]);

  useEffect(() => {
    if (!target) return;
    const { rect, zoom } = target;
    appliedScope.current = frame?.scope;
    baseZoom.current = zoom;
    if (!placed.current || motion.reduced) {
      placed.current = true;
      flight.current = null;
      camera.position.set(rect.cx, rect.cy, 100);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      // Picking reads this matrix, and on a slow device a click can beat the first frame.
      camera.updateMatrixWorld();
    } else {
      flight.current = {
        fromX: camera.position.x,
        fromY: camera.position.y,
        fromZoom: camera.zoom,
        toX: rect.cx,
        toY: rect.cy,
        toZoom: zoom,
        t: 0,
      };
      skipSamples.current = 2;
    }
    invalidate();
  }, [target, frame?.scope, camera, invalidate]);

  // Direct manipulation: drag to pan, wheel to zoom about the cursor.
  useEffect(() => {
    const element = gl.domElement;
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    const clampZoom = (zoom: number) =>
      Math.min(baseZoom.current * 6, Math.max(baseZoom.current * 0.5, zoom));
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      flight.current = null;
      const rect = element.getBoundingClientRect();
      const px = event.clientX - rect.left - rect.width / 2;
      const py = -(event.clientY - rect.top - rect.height / 2);
      const before = camera.zoom;
      const after = clampZoom(before * Math.exp(-event.deltaY * 0.0012));
      camera.position.x += px / before - px / after;
      camera.position.y += py / before - py / after;
      camera.zoom = after;
      camera.updateProjectionMatrix();
      invalidate();
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging || !(event.buttons & 1)) {
        dragging = false;
        return;
      }
      // A click often contains a little pointer jitter. Only a real drag interrupts a flight.
      if (!moved && Math.hypot(event.clientX - startX, event.clientY - startY) <= 4) return;
      moved = true;
      flight.current = null;
      camera.position.x -= (event.clientX - lastX) / camera.zoom;
      camera.position.y += (event.clientY - lastY) / camera.zoom;
      lastX = event.clientX;
      lastY = event.clientY;
      invalidate();
    };
    const onUp = () => {
      dragging = false;
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gl, camera, invalidate]);

  useEffect(() => {
    cameraControl.zoomBy = (factor) => {
      flight.current = {
        fromX: camera.position.x,
        fromY: camera.position.y,
        fromZoom: camera.zoom,
        toX: camera.position.x,
        toY: camera.position.y,
        toZoom: Math.min(
          baseZoom.current * 6,
          Math.max(baseZoom.current * 0.5, camera.zoom * factor),
        ),
        t: motion.reduced ? 1 : 0.5,
      };
      invalidate();
    };
    cameraControl.fit = () => {
      if (!target) return;
      flight.current = {
        fromX: camera.position.x,
        fromY: camera.position.y,
        fromZoom: camera.zoom,
        toX: target.rect.cx,
        toY: target.rect.cy,
        toZoom: target.zoom,
        t: motion.reduced ? 1 : 0,
      };
      invalidate();
    };
    cameraControl.settle = () => {
      if (flight.current) flight.current.t = 1;
      invalidate();
    };
    // Also true between a scope decision and this rig applying it: the canvas commits after the DOM.
    cameraControl.moving = () =>
      flight.current !== null || appliedScope.current !== useStore.getState().scope;
  }, [camera, invalidate, target]);

  useEffect(() => {
    gl.info.autoReset = false;
  }, [gl]);

  useFrame((_state, delta) => {
    gl.info.reset();
    const active = flight.current;
    if (active) {
      active.t = Math.min(1, active.t + frameDelta(delta) / FLIGHT_SECONDS);
      const eased = easeInOut(active.t);
      camera.position.x = active.fromX + (active.toX - active.fromX) * eased;
      camera.position.y = active.fromY + (active.toY - active.fromY) * eased;
      camera.zoom = active.fromZoom * (active.toZoom / active.fromZoom) ** eased;
      camera.updateProjectionMatrix();
      if (active.t >= 1) flight.current = null;
      else invalidate();

      // Adaptive quality: measured only during real motion, where a frame loop is running.
      if (skipSamples.current > 0) skipSamples.current -= 1;
      else {
        samples.current.push(delta);
        if (samples.current.length >= 24) {
          const sorted = [...samples.current].sort((a, b) => a - b);
          if ((sorted[12] as number) > 0.024) lower();
          samples.current = [];
        }
      }
    }
    cameraControl.onViewport?.({
      x: camera.position.x - size.width / (2 * camera.zoom),
      y: camera.position.y + size.height / (2 * camera.zoom),
      w: size.width / camera.zoom,
      h: size.height / camera.zoom,
    });
  }, -1);

  return null;
}

/** Hop-by-hop playback. Prepared explanation only: nothing here implies observed traffic. */
function FlowRunner({ frames }: { frames: Frame[] }) {
  const invalidate = useThree((s) => s.invalidate);
  const flowId = useStore((s) => s.flowId);
  const flowStep = useStore((s) => s.flowStep);
  const playing = useStore((s) => s.playing);
  const eye = useStore((s) => s.eye);
  const index = useStore((s) => s.index);
  const layouts = useStore((s) => s.layouts);
  const theme = sceneTheme(
    useStore((s) => s.theme),
    eye,
  );
  const tokenMesh = useRef<Group>(null);
  const tailMeshes = useRef<(Mesh | null)[]>([]);
  const run = useRef({
    step: null as number | null,
    flowId: null as string | null,
    phase: "idle" as "idle" | "wait" | "travel" | "dwell",
    t: 0,
  });

  const flow = useMemo(
    () => index?.graph.flows.find((f) => f.id === flowId) ?? null,
    [index, flowId],
  );
  const tokenColor = useMemo(() => new Color(theme.accent).multiplyScalar(theme.glow), [theme]);

  const hop = useMemo(() => {
    if (!index || !flow || flowStep === null) return null;
    const step = flow.steps[flowStep];
    if (!step) return null;
    const view = hopView(index, step);
    const frame = frames.find((f) => f.scope === view.scope);
    const layout = layouts[scopeKey(view.scope)];
    if (!frame || !layout) return null;
    const { current } = dyedEdges(scopeGraph(index, view.scope).edges, flow, flowStep);
    const route = current ? layout.routes[current] : null;
    if (!route) return { edge: null, route: null, frame };
    return { edge: current, route: chamferRoute(toWorld(route), 18), frame };
  }, [index, flow, flowStep, frames, layouts]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: these are the wake-up triggers.
  useEffect(() => invalidate(), [flowStep, playing, hop, eye, invalidate]);

  useFrame((state, delta) => {
    const r = run.current;
    const store = useStore.getState();
    const mesh = tokenMesh.current;
    if (flowStep !== r.step || flowId !== r.flowId) {
      r.step = flowStep;
      r.flowId = flowId;
      r.phase = flowStep === null ? "idle" : "wait";
      r.t = 0;
      tokenState.edge = hop?.edge ?? null;
      tokenState.progress = 0;
      tokenState.visible = false;
    }
    if (r.phase === "wait" && !cameraControl.moving()) {
      r.phase = "travel";
      r.t = 0;
      tokenState.edge = hop?.edge ?? null;
    }
    if (r.phase === "travel") {
      r.t = motion.reduced || !hop?.route ? 1 : Math.min(1, r.t + frameDelta(delta) / HOP_SECONDS);
      tokenState.progress = easeInOut(r.t);
      tokenState.visible = Boolean(hop?.route);
      if (r.t >= 1) {
        r.phase = "dwell";
        r.t = 0;
      }
    } else if (r.phase === "dwell" && store.playing) {
      r.t += frameDelta(delta);
      const dwell = motion.reduced ? REDUCED_DWELL_SECONDS : DWELL_SECONDS;
      if (r.t >= dwell && flow && flowStep !== null) {
        if (flowStep < flow.steps.length - 1) store.goToStep(flowStep + 1);
        else store.setPlaying(false);
      }
    }
    if (mesh) {
      mesh.visible = eye === "tracer" && tokenState.visible && Boolean(hop?.route);
      if (hop?.route && mesh.visible) {
        const [x, y] = pointAlong(hop.route as Point[], tokenState.progress);
        mesh.position.set(
          hop.frame.ox + x * hop.frame.scale,
          hop.frame.oy + y * hop.frame.scale,
          0,
        );
        // The travelling signal stays legible in nested modules and on an overview.
        mesh.scale.setScalar(1 / state.camera.zoom);
      }
    }
    tailMeshes.current.forEach((tail, i) => {
      if (!tail) return;
      tail.visible =
        Boolean(mesh?.visible) && !motion.reduced && tokenState.progress > 0.025 * (i + 1);
      if (!hop?.route || !tail.visible) return;
      const [x, y] = pointAlong(hop.route, Math.max(0, tokenState.progress - 0.025 * (i + 1)));
      tail.position.set(hop.frame.ox + x * hop.frame.scale, hop.frame.oy + y * hop.frame.scale, 0);
      tail.scale.setScalar(1 / state.camera.zoom);
    });
    if (r.phase === "wait" || r.phase === "travel" || (r.phase === "dwell" && store.playing))
      invalidate();
  });

  return (
    <>
      <group ref={tokenMesh} visible={false}>
        <mesh renderOrder={9001} raycast={() => null}>
          <circleGeometry args={[4.5, 24]} />
          <meshBasicMaterial
            color={tokenColor}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh renderOrder={9000} raycast={() => null}>
          <ringGeometry args={[7, 11, 32]} />
          <meshBasicMaterial
            color={tokenColor}
            transparent
            opacity={0.34}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            tailMeshes.current[i] = mesh;
          }}
          visible={false}
          renderOrder={9000}
          raycast={() => null}
        >
          <circleGeometry args={[3 - i * 0.65, 16]} />
          <meshBasicMaterial
            color={tokenColor}
            transparent
            opacity={0.55 - i * 0.15}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}

function Scene() {
  const index = useStore((s) => s.index);
  const scope = useStore((s) => s.scope);
  const eye = useStore((s) => s.eye);
  const selection = useStore((s) => s.selection);
  const matches = useStore((s) => s.matches);
  const flowId = useStore((s) => s.flowId);
  const flowStep = useStore((s) => s.flowStep);
  const pingToken = useStore((s) => s.pingToken);
  const themeName = useStore((s) => s.theme);
  const layouts = useStore((s) => s.layouts);
  const frames = useActiveFrames(index, scope);

  // A closed scope stays mounted just long enough to fold back into its part.
  const [exiting, setExiting] = useState<Frame[]>([]);
  const previous = useRef<Frame[]>([]);
  useEffect(() => {
    const gone = previous.current.filter((f) => !frames.some((n) => n.scope === f.scope));
    previous.current = frames;
    if (gone.length === 0 || motion.reduced) return;
    setExiting((current) => [
      ...current.filter((f) => !gone.some((g) => g.scope === f.scope)),
      ...gone,
    ]);
    const timer = setTimeout(() => {
      setExiting((current) => current.filter((f) => !gone.some((g) => g.scope === f.scope)));
    }, 420);
    return () => clearTimeout(timer);
  }, [frames]);

  const model = useMemo<SceneModel | null>(() => {
    if (!index) return null;
    const flow = eye === "tracer" ? (index.graph.flows.find((f) => f.id === flowId) ?? null) : null;
    const selectedPart = selection?.type === "part" ? selection.id : null;
    const visible = (index.children.get(scope) ?? []).map((p) => p.id);
    const selectedConnections = new Set(selection?.type === "edge" ? selection.connections : []);
    return {
      index,
      visuals: partVisuals(index, { eye, scope, selected: selectedPart, matches, flow, flowStep }),
      marks: triage(index, visible).marks,
      selectedPart,
      selectedConnections,
      flow,
      flowStep,
      theme: sceneTheme(themeName, eye),
      eye,
      pingToken,
      sonarActive: eye === "sonar" && matches.length > 0,
    };
  }, [index, eye, scope, selection, matches, flowId, flowStep, pingToken, themeName]);

  const invalidate = useThree((s) => s.invalidate);
  // biome-ignore lint/correctness/useExhaustiveDependencies: redraw whenever the model changes.
  useEffect(() => invalidate(), [model, invalidate]);

  if (!index || !model) return null;
  const depthOf = (frame: Frame) => frames.findIndex((f) => f.scope === frame.scope);
  return (
    <>
      <CameraRig />
      <FlowRunner frames={frames} />
      {frames.map((frame) => {
        const layout = layouts[scopeKey(frame.scope)];
        if (!layout) return null;
        return (
          <ScopeLayer
            key={scopeKey(frame.scope)}
            frame={frame}
            layout={layout}
            depth={depthOf(frame)}
            active={frame.scope === scope}
            exiting={false}
            model={model}
          />
        );
      })}
      {exiting.map((frame, i) => {
        const layout = layouts[scopeKey(frame.scope)];
        if (!layout) return null;
        return (
          <ScopeLayer
            key={scopeKey(frame.scope)}
            frame={frame}
            layout={layout}
            depth={frames.length + i}
            active={false}
            exiting
            model={model}
          />
        );
      })}
      <GapMark frames={frames} />
    </>
  );
}

/** An unresolved Tracer step stays visible: a diamond at the break, never a silent skip. */
function GapMark({ frames }: { frames: Frame[] }) {
  const index = useStore((s) => s.index);
  const eye = useStore((s) => s.eye);
  const flowId = useStore((s) => s.flowId);
  const flowStep = useStore((s) => s.flowStep);
  const layouts = useStore((s) => s.layouts);
  const theme = sceneTheme(
    useStore((s) => s.theme),
    eye,
  );

  const placement = useMemo(() => {
    if (!index || eye !== "tracer" || flowStep === null) return null;
    const step = index.graph.flows.find((f) => f.id === flowId)?.steps[flowStep];
    if (!step?.gap) return null;
    const view = hopView(index, step);
    const frame = frames.find((f) => f.scope === view.scope);
    const layout = layouts[scopeKey(view.scope)];
    if (!frame || !layout) return null;
    const known = view.from ?? view.to;
    const box = known ? layout.nodes[known] : null;
    if (!box) return null;
    const rect: Rect = worldBox(frame, box);
    return {
      x: rect.cx + (view.from ? rect.w / 2 + 16 : -rect.w / 2 - 16),
      y: rect.cy,
      scale: frame.scale,
    };
  }, [index, eye, flowId, flowStep, frames, layouts]);

  if (!placement) return null;
  return (
    <mesh
      position={[placement.x, placement.y, 0]}
      rotation={[0, 0, Math.PI / 4]}
      scale={placement.scale}
      renderOrder={9000}
      raycast={() => null}
    >
      <planeGeometry args={[12, 12]} />
      <meshBasicMaterial
        color={theme.warn}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function Effects() {
  const themeName = useStore((s) => s.theme);
  const level = useQuality((s) => s.level);
  if (themeName !== "dark" || !QUALITY_LEVELS[level]?.bloom) return null;
  return (
    <EffectComposer
      multisampling={0}
      frameBufferType={HalfFloatType}
      depthBuffer={false}
      stencilBuffer={false}
    >
      <Bloom
        mipmapBlur
        luminanceThreshold={1}
        luminanceSmoothing={0.1}
        intensity={0.32}
        radius={0.5}
      />
    </EffectComposer>
  );
}

function ThemeBackground() {
  const theme = sceneTheme(
    useStore((s) => s.theme),
    useStore((s) => s.eye),
  );
  const invalidate = useThree((s) => s.invalidate);
  // biome-ignore lint/correctness/useExhaustiveDependencies: redraw when the theme changes.
  useEffect(() => invalidate(), [theme, invalidate]);
  return (
    <>
      <color attach="background" args={[theme.ground]} />
      <MapGrid theme={theme} />
    </>
  );
}

function DebugBridge() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    if (!debugEnabled) return;
    (window as unknown as Record<string, unknown>).__archeion = {
      store: useStore,
      quality: useQuality,
      invalidate,
      stats: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles }),
      camera: () => ({ x: camera.position.x, y: camera.position.y, zoom: camera.zoom }),
      moving: () => cameraControl.moving(),
      /** Where a visible part is drawn, in page coordinates, for tests that click the canvas. */
      screenOf: (id: string) => {
        const { index, scope, layouts } = useStore.getState();
        if (!index) return null;
        const frames = computeFrames(layouts, scopePath(index, scope), scopeKey);
        for (const frame of [...frames].reverse()) {
          const box = layouts[scopeKey(frame.scope)]?.nodes[id];
          if (!box) continue;
          const rect = worldBox(frame, box);
          const bounds = gl.domElement.getBoundingClientRect();
          return {
            x: bounds.left + bounds.width / 2 + (rect.cx - camera.position.x) * camera.zoom,
            y: bounds.top + bounds.height / 2 - (rect.cy - camera.position.y) * camera.zoom,
            w: rect.w * camera.zoom,
            h: rect.h * camera.zoom,
          };
        }
        return null;
      },
      /** The opened scope's frame, in page coordinates. */
      frameOnScreen: () => {
        const { index, scope, layouts } = useStore.getState();
        if (!index) return null;
        const rect = computeFrames(layouts, scopePath(index, scope), scopeKey).at(-1)?.rect;
        if (!rect) return null;
        const bounds = gl.domElement.getBoundingClientRect();
        return {
          x: bounds.left + bounds.width / 2 + (rect.cx - camera.position.x) * camera.zoom,
          y: bounds.top + bounds.height / 2 - (rect.cy - camera.position.y) * camera.zoom,
          w: rect.w * camera.zoom,
          h: rect.h * camera.zoom,
        };
      },
      visibleCounts: () => {
        const { index, scope } = useStore.getState();
        if (!index) return null;
        const graph = scopeGraph(index, scope);
        return {
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          totalParts: index.graph.parts.length,
        };
      },
      renderer: () => {
        const context = gl.getContext();
        const extension = context.getExtension("WEBGL_debug_renderer_info");
        return {
          webgl2: context instanceof WebGL2RenderingContext,
          vendor: extension ? context.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
          renderer: extension ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
          pixelRatio: gl.getPixelRatio(),
        };
      },
    };
  }, [gl, invalidate, camera]);
  return null;
}

export function MapCanvas() {
  const level = useQuality((s) => s.level);
  const dpr = Math.min(window.devicePixelRatio || 1, QUALITY_LEVELS[level]?.dpr ?? 1);
  return (
    <Canvas
      orthographic
      flat
      frameloop="demand"
      dpr={dpr}
      camera={{ position: [0, 0, 100], near: 0.1, far: 1000, zoom: 1 }}
      gl={{
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      }}
      onPointerMissed={(event) => {
        if (event.type === "click") useStore.getState().select(null);
      }}
      aria-hidden="true"
    >
      <ThemeBackground />
      <Suspense fallback={null}>
        <Scene />
        <Effects />
      </Suspense>
      <DebugBridge />
    </Canvas>
  );
}
