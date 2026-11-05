import type { Flow, Part } from "@archeion/core/contracts";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { PartVisual, TriageMark } from "../logic/emphasis";
import { FRAME_TOP, type Frame } from "../logic/frames";
import { type GraphIndex, type ScopeEdge, scopeGraph } from "../logic/graphIndex";
import { safeLabel } from "../logic/labels";
import type { CachedLayout, Point } from "../logic/layoutPolicy";
import { dyedEdges } from "../logic/tracer";
import { useStore } from "../store";
import { EdgeRibbon, type EdgeTone, Stations } from "./Edges";
import { applyPartTheme, partMaterial } from "./materials";
import { approach } from "./motion";
import { FONTS, Label, labelStrength, PartBox, type TextMesh } from "./Parts";
import { repositoryColor, type SceneTheme } from "./theme";

const RESOURCE_KINDS = new Set<Part["kind"]>([
  "database",
  "cache",
  "queue",
  "storage",
  "secrets",
  "external",
]);

export interface SceneModel {
  index: GraphIndex;
  visuals: Map<string, PartVisual>;
  marks: Map<string, TriageMark>;
  selectedPart: string | null;
  selectedConnections: Set<string>;
  flow: Flow | null;
  flowStep: number | null;
  theme: SceneTheme;
  eye: string;
  pingToken: number;
  sonarActive: boolean;
}

function edgeTone(edge: ScopeEdge, model: SceneModel, dyed: boolean): EdgeTone {
  if (edge.connections.some((id) => model.selectedConnections.has(id))) return "focus";
  const from = model.visuals.get(edge.from);
  const to = model.visuals.get(edge.to);
  if (model.eye === "tracer" && model.flow && model.flowStep !== null)
    return dyed ? "context" : "dim";
  if (model.eye === "radar" || model.sonarActive) {
    return from?.tone === "focus" || to?.tone === "focus" ? "context" : "dim";
  }
  if (model.selectedPart && (edge.from === model.selectedPart || edge.to === model.selectedPart)) {
    return "context";
  }
  return "quiet";
}

/** One level of the map: a frame with its parts and lines. Kept mounted across eye changes. */
export const ScopeLayer = memo(function ScopeLayer(props: {
  frame: Frame;
  layout: CachedLayout;
  depth: number;
  active: boolean;
  exiting: boolean;
  model: SceneModel;
}) {
  const { frame, layout, depth, active, exiting, model } = props;
  const { index, visuals, marks, theme } = model;
  const invalidate = useThree((state) => state.invalidate);
  const layer = useRef({ value: frame.scope === null ? 1 : 0 }).current;
  const open = useRef({ value: frame.scope === null ? 1 : 0 }).current;
  const titleRef = useRef<TextMesh | null>(null);
  const graph = useMemo(() => scopeGraph(index, frame.scope), [index, frame.scope]);
  const base = depth * 100;

  const plateMaterial = useMemo(
    () => (frame.scope ? partMaterial({ value: 1 }) : null),
    [frame.scope],
  );
  useEffect(() => () => plateMaterial?.dispose(), [plateMaterial]);
  useLayoutEffect(() => {
    if (!plateMaterial) return;
    applyPartTheme(plateMaterial, theme, theme.plate);
    (plateMaterial.uniforms.uContext as { value: number }).value = 1;
    invalidate();
  }, [plateMaterial, theme, invalidate]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: these props are wake-up triggers.
  useEffect(() => invalidate(), [active, exiting, invalidate]);

  useFrame((_state, delta) => {
    const targetOpen = exiting ? 0 : 1;
    const targetLayer = exiting ? 0 : active ? 1 : theme.ghost;
    open.value = approach(open.value, targetOpen, delta, 11);
    layer.value = approach(layer.value, targetLayer, delta, 11);
    if (plateMaterial && frame.box) {
      const w = frame.box.w + (frame.rect.w - frame.box.w) * open.value;
      const h = frame.box.h + (frame.rect.h - frame.box.h) * open.value;
      (plateMaterial.uniforms.uSize as { value: number[] }).value = [w, h];
      (plateMaterial.uniforms.uAlpha as { value: number }).value = Math.min(1, open.value * 6);
    }
    if (titleRef.current) titleRef.current.fillOpacity = labelStrength(layer.value, theme.ghost);
    if (open.value !== targetOpen || layer.value !== targetLayer) invalidate();
  });

  const setTitle = useCallback((mesh: TextMesh | null) => {
    titleRef.current = mesh;
  }, []);
  const { select, open: openPart, reveal } = useStore.getState();
  const activate = useCallback((id: string) => openPart(id), [openPart]);
  const activateStub = useCallback(
    (id: string) => reveal(id.replace(/^stub:(in|out):/, "")),
    [reveal],
  );
  const selectEdge = useCallback(
    (key: string) => {
      const edge = graph.edges.find((e) => e.key === key);
      if (edge) select({ type: "edge", key, connections: edge.connections });
    },
    [graph, select],
  );

  const { passed, current } = useMemo(
    () => dyedEdges(graph.edges, model.eye === "tracer" ? model.flow : null, model.flowStep),
    [graph.edges, model.eye, model.flow, model.flowStep],
  );

  const routes = useMemo(() => Object.values(layout.routes), [layout.routes]);
  const part = frame.scope ? index.parts.get(frame.scope) : null;
  const titleWidth = (part?.name.length ?? 0) * 11.4 + 22;

  // Painting follows render order, so z only decides picking: a deeper scope is nearer the camera.
  // Without it, the opened part's own box would take clicks meant for the children drawn over it.
  return (
    <group position={[0, 0, depth]}>
      {plateMaterial && frame.box ? (
        <group position={[frame.rect.cx, frame.rect.cy, -0.5]}>
          {/* The plane stays at full size; the frame opens by growing its shape in the shader. */}
          <mesh material={plateMaterial} renderOrder={base} raycast={() => null}>
            <planeGeometry args={[frame.rect.w + 8, frame.rect.h + 8]} />
          </mesh>
          {/* The frame is solid to the pointer: a click never reaches a ghost behind it. */}
          <mesh
            visible={false}
            onClick={(event) => {
              if (event.delta > 4) return;
              event.stopPropagation();
              if (frame.scope) select({ type: "part", id: frame.scope });
            }}
            onPointerOver={(event) => {
              event.stopPropagation();
              document.body.style.cursor = "";
            }}
          >
            <planeGeometry args={[frame.rect.w, frame.rect.h]} />
          </mesh>
        </group>
      ) : null}
      <group position={[frame.ox, frame.oy, 0]} scale={frame.scale}>
        {part ? (
          // Notched into the top border, the same way the panels carry their titles.
          <group position={[0, FRAME_TOP, 0]}>
            <mesh position={[titleWidth / 2 - 10, 0, 0]} renderOrder={base}>
              <planeGeometry args={[titleWidth, 26]} />
              <meshBasicMaterial
                color={theme.plate}
                transparent
                depthTest={false}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <Label
              text={safeLabel(part.name)}
              x={0}
              y={0}
              size={20}
              font={FONTS.heading}
              color={theme.text}
              order={base + 5}
              textRef={setTitle}
            />
          </group>
        ) : null}
        {graph.edges.map((edge) => {
          const route: Point[] | undefined = layout.routes[edge.key];
          if (!route) return null;
          const dyed = passed.has(edge.key) || current === edge.key;
          return (
            <EdgeRibbon
              key={edge.key}
              edgeKey={edge.key}
              route={route}
              tone={edgeTone(edge, model, dyed)}
              dashed={edge.unknown}
              main={edge.connections.some((id) => index.connections.get(id)?.crossRepo)}
              dye={current === edge.key ? "current" : passed.has(edge.key) ? "passed" : "none"}
              theme={theme}
              layer={layer}
              order={base + 1}
              onSelect={active ? selectEdge : null}
            />
          );
        })}
        <Stations
          routes={routes}
          theme={theme}
          fill={frame.scope ? theme.plate : theme.ground}
          dim={
            model.sonarActive ||
            model.eye === "radar" ||
            (model.eye === "tracer" && model.flowStep !== null)
          }
          layer={layer}
          order={base + 3}
        />
        {graph.nodes.map((node) => {
          const box = layout.nodes[node.id];
          const nodePart = index.parts.get(node.part);
          if (!box || !nodePart) return null;
          if (node.type === "stub") {
            return (
              <PartBox
                key={node.id}
                id={node.id}
                box={box}
                name={nodePart.name}
                detail=""
                meta=""
                identity={theme.lineMain}
                tone={visuals.get(node.part)?.tone === "dim" ? "dim" : "quiet"}
                badge={null}
                blip="none"
                tag={null}
                agent={false}
                selected={false}
                hasInside={false}
                resource={false}
                unknown={nodePart.kind === "unknown"}
                isAgentKind={false}
                extractedOnly={false}
                mark={null}
                markCount={0}
                stub
                theme={theme}
                layer={layer}
                frameScale={frame.scale}
                order={base + 2}
                pingToken={0}
                onActivate={activateStub}
              />
            );
          }
          const visual = visuals.get(node.part);
          const mark = marks.get(node.part);
          return (
            <PartBox
              key={node.id}
              id={node.id}
              box={box}
              name={nodePart.name}
              detail={
                nodePart.tech ?? (nodePart.kind === "unknown" ? "not established" : nodePart.kind)
              }
              meta={
                RESOURCE_KINDS.has(nodePart.kind)
                  ? `${nodePart.resource?.provider.toUpperCase() ?? "EXTERNAL"} · ${nodePart.kind}`
                  : nodePart.repos.join(" + ") || "PLATFORM"
              }
              identity={
                RESOURCE_KINDS.has(nodePart.kind)
                  ? theme.resource
                  : repositoryColor(nodePart.repos[0] ?? "platform", theme.glow === 1)
              }
              tone={visual?.tone ?? "quiet"}
              badge={visual?.badge ?? null}
              blip={visual?.blip ?? "none"}
              tag={visual?.tag ?? null}
              agent={visual?.agent ?? false}
              selected={model.selectedPart === node.part}
              hasInside={nodePart.hasInside}
              resource={RESOURCE_KINDS.has(nodePart.kind)}
              unknown={nodePart.kind === "unknown"}
              isAgentKind={nodePart.kind === "agent"}
              extractedOnly={nodePart.provenance === "extracted"}
              mark={active ? (mark?.severity ?? null) : null}
              markCount={mark?.count ?? 0}
              stub={false}
              theme={theme}
              layer={layer}
              frameScale={frame.scale}
              order={base + 2}
              pingToken={active ? model.pingToken : 0}
              onActivate={activate}
            />
          );
        })}
      </group>
    </group>
  );
});
