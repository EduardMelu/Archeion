import { Component, type ReactNode, useEffect, useLayoutEffect, useState } from "react";
import { startArtifactLoading } from "./data/load";
import { layoutAllScopes } from "./layout/client";
import { search } from "./logic/search";
import { cameraControl } from "./scene/control";
import { MapCanvas } from "./scene/MapCanvas";
import { useStore } from "./store";
import { RadarPanel, SonarPanel, TracerPanel } from "./ui/EyePanels";
import { Inspector } from "./ui/Inspector";
import { Minimap, PlacedNotice, TracerCaption } from "./ui/MapOverlays";
import { Outline } from "./ui/Outline";
import { StatusBar } from "./ui/StatusBar";
import { Frame } from "./ui/shared";
import { EYES, TopBar } from "./ui/TopBar";
import { TrailPanel } from "./ui/Trails";
import s from "./ui/ui.module.css";
import { Workspace } from "./ui/Workspace";

function hasWebGL2(): boolean {
  try {
    return document.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) {
      return (
        <div className={s.mapNotice}>
          The map could not be drawn on this device. Parts, evidence, and every eye stay available
          in the panels.
        </div>
      );
    }
    return this.props.children;
  }
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.matches("input, textarea, select");
      const state = useStore.getState();
      if (event.key === "Escape") {
        if (typing) target.blur();
        else if (state.playing) state.setPlaying(false);
        else state.goUp();
        return;
      }
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

      const eye = EYES[Number(event.key) - 1];
      if (eye) {
        state.setEye(eye.id);
      } else if (event.key === "/") {
        event.preventDefault();
        state.setEye("sonar");
        requestAnimationFrame(() => document.getElementById("sonar-query")?.focus());
      } else if (event.key === " " && !target.matches("button, a, summary")) {
        // Space stops everything: playback pauses, and a camera move lands at once.
        event.preventDefault();
        cameraControl.settle();
        if (state.eye === "tracer" && state.flowId) {
          if (state.playing) {
            state.setPlaying(false);
          } else {
            if (state.flowStep === null) state.goToStep(0);
            state.setPlaying(true);
          }
        }
      } else if (event.key === "ArrowRight" && state.eye === "tracer" && state.flowId) {
        state.setPlaying(false);
        state.goToStep((state.flowStep ?? -1) + 1);
      } else if (event.key === "ArrowLeft" && state.eye === "tracer" && state.flowId) {
        state.setPlaying(false);
        if ((state.flowStep ?? 0) > 0) state.goToStep((state.flowStep ?? 0) - 1);
      } else if (event.key === "+" || event.key === "=") {
        cameraControl.zoomBy(1.33);
      } else if (event.key === "-") {
        cameraControl.zoomBy(0.75);
      } else if (event.key === "0") {
        cameraControl.fit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function EyeRail() {
  const eye = useStore((state) => state.eye);
  const left = useStore((state) => state.left);
  if (left === "trails") return <TrailPanel />;
  if (eye === "tracer") return <TracerPanel />;
  if (eye === "radar") return <RadarPanel />;
  if (eye === "sonar") return <SonarPanel />;
  return null;
}

function Blocking({ message }: { message: string }) {
  return (
    <div className={s.blocking}>
      <div className={s.blockingFrame}>
        <Frame title="Archeion">
          <h1 className={s.blockingTitle}>No map to show yet</h1>
          <p className={s.body} role="alert">
            {message}
          </p>
        </Frame>
      </div>
    </div>
  );
}

export function App() {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [webgl] = useState(hasWebGL2);
  const index = useStore((state) => state.index);
  const loadError = useStore((state) => state.loadError);
  const selection = useStore((state) => state.selection);
  const theme = useStore((state) => state.theme);
  const announcement = useStore((state) => state.announcement);
  const eye = useStore((state) => state.eye);
  const left = useStore((state) => state.left);
  const query = useStore((state) => state.query);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.eye = eye;
  }, [theme, eye]);

  useEffect(() => startArtifactLoading(), []);
  useKeyboard();

  useEffect(() => {
    if (index) void layoutAllScopes(index);
  }, [index]);

  // A rebuild can change what a standing query finds.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs for a new graph, not per keystroke.
  useEffect(() => {
    if (!index) return;
    const { setSonar } = useStore.getState();
    if (query)
      setSonar(
        query,
        search(index, query).map((r) => r.part),
        false,
      );
  }, [index]);

  const scope = useStore((state) => state.scope);
  const activeEye = EYES.find((item) => item.id === eye);
  const mapTitle = (scope ? index?.parts.get(scope)?.name : null) ?? index?.graph.workspace.name;

  if (loadError && !index) return <Blocking message={loadError} />;
  if (!index) {
    return (
      <div className={s.blocking} role="status">
        <span className={s.note}>Reading the generated graph…</span>
      </div>
    );
  }

  return (
    <div className={s.shell} data-eye={eye}>
      <TopBar onWorkspace={() => setWorkspaceOpen((open) => !open)} workspaceOpen={workspaceOpen} />
      <div className={s.main} data-details={Boolean(selection || workspaceOpen)}>
        <aside
          className={s.rail}
          aria-label={left === "trails" ? "Saved investigations and parts" : `${eye} and parts`}
        >
          <EyeRail />
          {eye === "atlas" && left === "eye" ? (
            <div className={s.atlasIntro}>
              <h2>See the whole system.</h2>
              <p>Open a service to explore its modules. Follow the lines to see what connects.</p>
              <div className={s.repoStrip} role="group" aria-label="Connected repositories">
                {index.graph.repos
                  .filter((repo) =>
                    index.graph.comparison.repos.some((row) => row.repo === repo.id),
                  )
                  .map((repo) => (
                    <span key={repo.id} className={s.repoChip}>
                      {repo.name}
                    </span>
                  ))}
              </div>
            </div>
          ) : null}
          <Outline grow={eye === "atlas" && left === "eye"} />
        </aside>
        <main className={s.mapFrame} aria-label="Architecture map">
          <div className={s.mapHeading}>
            <div>
              <h1>{mapTitle}</h1>
              <p>{activeEye?.question}</p>
            </div>
            <div className={s.mapNavigation}>
              <button
                type="button"
                className={s.button}
                disabled={!scope}
                onClick={() => useStore.getState().goUp()}
                title="Back one level (Escape)"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="m7 3-5 5 5 5M2 8h12" />
                </svg>
                Back
              </button>
              <button
                type="button"
                className={s.button}
                disabled={!scope && !selection}
                onClick={() => {
                  useStore.getState().setScope(null);
                  useStore.getState().select(null);
                  cameraControl.fit();
                }}
              >
                Overview
              </button>
            </div>
          </div>
          <div className={s.mapColumn}>
            <div className={s.mapLegend} role="group" aria-label="Map legend">
              <span>
                <i className={s.serviceMark} /> Service / module
              </span>
              <span>
                <i className={s.resourceMark} /> External resource
              </span>
              <span>
                {index.graph.comparison.repos.length}{" "}
                {index.graph.comparison.repos.length === 1 ? "repository" : "repositories"}
              </span>
            </div>
            {webgl ? (
              <CanvasBoundary>
                <div className={s.mapCanvas}>
                  <MapCanvas />
                </div>
                <Minimap />
                <PlacedNotice />
                <TracerCaption />
                <div className={s.mapHint}>
                  Click to explore <span>·</span> Scroll to zoom <span>·</span> Drag to pan{" "}
                  <span>·</span> Esc to go back
                </div>
              </CanvasBoundary>
            ) : (
              <div className={s.mapNotice}>
                This browser has no WebGL2, so the map cannot be drawn. Parts, evidence, and every
                eye stay available in the panels.
              </div>
            )}
          </div>
        </main>
        {selection || workspaceOpen ? (
          <aside className={`${s.rail} ${s.detailRail}`} aria-label="Details">
            {selection ? <Inspector /> : <Workspace />}
          </aside>
        ) : null}
      </div>
      <StatusBar
        onIssues={() => {
          useStore.getState().select(null);
          setWorkspaceOpen(true);
        }}
      />
      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
