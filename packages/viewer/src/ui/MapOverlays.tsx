import { useEffect, useRef } from "react";
import { rearrange } from "../layout/client";
import { cameraControl } from "../scene/control";
import { scopeKey, useStore } from "../store";
import { Next, Pause, Play, Previous, Restart } from "./icons";
import { WarnMark } from "./shared";
import s from "./ui.module.css";

/** Overview plus detail. The viewport rectangle is written directly, never through React state. */
export function Minimap() {
  const index = useStore((state) => state.index);
  const layout = useStore((state) => state.layouts[scopeKey(null)]);
  const scope = useStore((state) => state.scope);
  const { open } = useStore.getState();
  const viewport = useRef<SVGRectElement>(null);

  useEffect(() => {
    cameraControl.onViewport = (rect) => {
      const element = viewport.current;
      if (!element) return;
      element.setAttribute("x", String(rect.x));
      element.setAttribute("y", String(-rect.y));
      element.setAttribute("width", String(rect.w));
      element.setAttribute("height", String(rect.h));
    };
    return () => {
      cameraControl.onViewport = null;
    };
  }, []);

  if (!index || !layout) return null;
  const pad = 40;
  const current = scope ? index.parts.get(scope) : null;
  let rootOfScope = current?.id ?? null;
  while (rootOfScope && index.parts.get(rootOfScope)?.parent)
    rootOfScope = index.parts.get(rootOfScope)?.parent ?? null;

  return (
    <div className={s.minimap} aria-hidden="true">
      <svg
        viewBox={`${-pad} ${-pad} ${layout.width + pad * 2} ${layout.height + pad * 2}`}
        role="presentation"
      >
        <defs>
          <clipPath id="minimap-clip">
            <rect
              x={-pad}
              y={-pad}
              width={layout.width + pad * 2}
              height={layout.height + pad * 2}
            />
          </clipPath>
        </defs>
        {Object.entries(layout.nodes).map(([id, box]) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut; the outline is the accessible route.
          <rect
            key={id}
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            fill={id === rootOfScope ? "var(--accent)" : "var(--line)"}
            onClick={() => open(id)}
          />
        ))}
        <g clipPath="url(#minimap-clip)">
          <rect
            ref={viewport}
            fill="none"
            stroke="var(--text-dim)"
            strokeWidth={layout.width / 168}
            pointerEvents="none"
          />
        </g>
      </svg>
    </div>
  );
}

export function PlacedNotice() {
  const index = useStore((state) => state.index);
  const scope = useStore((state) => state.scope);
  const placed = useStore((state) => state.newlyPlaced[scopeKey(scope)]);
  if (!index || !placed || placed.length === 0) return null;
  return (
    <div className={s.placed} role="status">
      <span>
        {placed.length === 1 ? "1 new part was" : `${placed.length} new parts were`} placed in free
        space, so nothing else moved.
      </span>
      <button type="button" className={s.button} onClick={() => void rearrange(index, scope)}>
        Rearrange
      </button>
    </div>
  );
}

export function TracerCaption() {
  const index = useStore((state) => state.index);
  const eye = useStore((state) => state.eye);
  const flowId = useStore((state) => state.flowId);
  const flowStep = useStore((state) => state.flowStep);
  const playing = useStore((state) => state.playing);
  const { goToStep, setPlaying } = useStore.getState();
  const toggle = useRef<HTMLButtonElement>(null);

  // Choosing a flow hands focus to playback, so Space pauses it rather than restarting the flow.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a flow is chosen.
  useEffect(() => {
    toggle.current?.focus({ preventScroll: true });
  }, [flowId, eye]);

  if (eye !== "tracer" || !index) return null;
  const flow = index.graph.flows.find((f) => f.id === flowId);
  if (!flow) return null;
  const step = flowStep === null ? null : flow.steps[flowStep];
  const last = flow.steps.length - 1;

  return (
    <div className={s.caption} role="group" aria-label="Flow playback">
      <span className={s.captionStep}>
        {flowStep === null ? 0 : flowStep + 1}/{flow.steps.length}
      </span>
      <div>
        <p className={s.captionText}>{step?.caption || flow.name}</p>
        {step?.gap ? (
          <p className={s.problem} style={{ padding: 0 }}>
            <WarnMark />
            <span>{step.gap}</span>
          </p>
        ) : null}
      </div>
      <div className={s.controls}>
        <button
          type="button"
          className={s.iconButton}
          aria-label="Previous step"
          title="Previous step (left arrow)"
          disabled={flowStep === null || flowStep <= 0}
          onClick={() => {
            setPlaying(false);
            goToStep((flowStep ?? 0) - 1);
          }}
        >
          <Previous />
        </button>
        <button
          ref={toggle}
          type="button"
          className={s.iconButton}
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause (Space)" : "Play (Space)"}
          onClick={() => {
            if (playing) {
              setPlaying(false);
            } else {
              if (flowStep === null || flowStep >= last) goToStep(0);
              setPlaying(true);
            }
          }}
        >
          {playing ? <Pause /> : <Play />}
        </button>
        <button
          type="button"
          className={s.iconButton}
          aria-label="Next step"
          title="Next step (right arrow)"
          disabled={flowStep !== null && flowStep >= last}
          onClick={() => {
            setPlaying(false);
            goToStep((flowStep ?? -1) + 1);
          }}
        >
          <Next />
        </button>
        <button
          type="button"
          className={s.iconButton}
          aria-label="Restart"
          title="Restart"
          onClick={() => {
            setPlaying(false);
            goToStep(0);
          }}
        >
          <Restart />
        </button>
      </div>
    </div>
  );
}
