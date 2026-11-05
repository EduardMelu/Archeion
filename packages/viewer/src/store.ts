// Interaction decisions only. Camera, token, and material values stay in the scene's refs.
import type { BuildInfo, Eye, Graph, Trail } from "@archeion/core/contracts";
import { create } from "zustand";
import { type GraphIndex, indexGraph, pathTo } from "./logic/graphIndex";
import type { CachedLayout } from "./logic/layoutPolicy";
import { hopView } from "./logic/tracer";

export type Selection =
  | { type: "part"; id: string }
  | { type: "edge"; key: string; connections: string[] }
  | { type: "removed"; id: string }
  | null;

export type Theme = "dark" | "light";
export type LeftPanel = "eye" | "trails";

function storedTheme(): Theme {
  try {
    return localStorage.getItem("archeion-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

interface State {
  index: GraphIndex | null;
  digest: string | null;
  buildInfo: BuildInfo | null;
  loadError: string | null;
  layouts: Record<string, CachedLayout>;
  newlyPlaced: Record<string, string[]>;

  eye: Eye;
  scope: string | null;
  selection: Selection;
  theme: Theme;
  left: LeftPanel;
  query: string;
  matches: string[];
  flowId: string | null;
  flowStep: number | null;
  playing: boolean;
  pingToken: number;
  activeTrail: Trail | null;
  announcement: string;

  setGraph: (graph: Graph, digest: string, info: BuildInfo) => void;
  setBuildInfo: (info: BuildInfo) => void;
  setLoadError: (message: string | null) => void;
  setLayout: (scopeKey: string, layout: CachedLayout, placed: string[]) => void;
  setEye: (eye: Eye) => void;
  setScope: (scope: string | null) => void;
  open: (id: string) => void;
  reveal: (id: string) => void;
  goUp: () => void;
  select: (selection: Selection) => void;
  setSonar: (query: string, matches: string[], ping: boolean) => void;
  setFlow: (flowId: string | null) => void;
  goToStep: (step: number) => void;
  setPlaying: (playing: boolean) => void;
  toggleTheme: () => void;
  setLeft: (left: LeftPanel) => void;
  setActiveTrail: (trail: Trail | null) => void;
  announce: (message: string) => void;
}

const nameOf = (index: GraphIndex | null, id: string | null) =>
  id ? (index?.parts.get(id)?.name ?? id) : (index?.graph.workspace.name ?? "workspace");

export const useStore = create<State>((set, get) => ({
  index: null,
  digest: null,
  buildInfo: null,
  loadError: null,
  layouts: {},
  newlyPlaced: {},

  eye: "atlas",
  scope: null,
  selection: null,
  theme: storedTheme(),
  left: "eye",
  query: "",
  matches: [],
  flowId: null,
  flowStep: null,
  playing: false,
  pingToken: 0,
  activeTrail: null,
  announcement: "",

  setGraph: (graph, digest, buildInfo) =>
    set((state) => {
      const index = indexGraph(graph);
      // Preserve valid context across a rebuild: climb out of anything that no longer exists.
      let scope = state.scope;
      while (scope && !index.parts.has(scope))
        scope = state.index?.parts.get(scope)?.parent ?? null;
      const selection =
        state.selection?.type === "part" && !index.parts.has(state.selection.id)
          ? null
          : state.selection;
      const flowId =
        state.flowId && graph.flows.some((f) => f.id === state.flowId) ? state.flowId : null;
      return {
        index,
        digest,
        buildInfo,
        loadError: null,
        scope,
        selection,
        flowId,
        flowStep: flowId ? state.flowStep : null,
      };
    }),
  setBuildInfo: (buildInfo) => set({ buildInfo }),
  setLoadError: (loadError) => set({ loadError }),
  setLayout: (scopeKey, layout, placed) =>
    set((state) => ({
      layouts: { ...state.layouts, [scopeKey]: layout },
      newlyPlaced: { ...state.newlyPlaced, [scopeKey]: placed },
    })),

  setEye: (eye) => {
    set({ eye, left: "eye", playing: false, announcement: `${eye} eye` });
  },
  setScope: (scope) => set({ scope }),
  open: (id) => {
    const { index } = get();
    const part = index?.parts.get(id);
    if (!part) return;
    set({
      scope: part.hasInside ? id : part.parent,
      selection: { type: "part", id },
      announcement: part.hasInside ? `Opened ${part.name}` : `Selected ${part.name}`,
    });
  },
  reveal: (id) => {
    const { index } = get();
    const part = index?.parts.get(id);
    if (!part) return;
    set({
      scope: part.parent,
      selection: { type: "part", id },
      announcement: `Selected ${part.name}`,
    });
  },
  goUp: () => {
    const { scope, index } = get();
    if (!scope) {
      set({ selection: null });
      return;
    }
    const parent = index?.parts.get(scope)?.parent ?? null;
    set({
      scope: parent,
      selection: { type: "part", id: scope },
      announcement: `Back to ${nameOf(index, parent)}`,
    });
  },
  select: (selection) => set({ selection }),
  setSonar: (query, matches, ping) =>
    set((state) => ({ query, matches, pingToken: ping ? state.pingToken + 1 : state.pingToken })),
  setFlow: (flowId) =>
    set((state) => {
      if (!flowId) return { flowId: null, flowStep: null, playing: false };
      return { flowId, flowStep: null, playing: false, scope: state.scope, selection: null };
    }),
  goToStep: (step) => {
    const { index, flowId } = get();
    const flow = index?.graph.flows.find((f) => f.id === flowId);
    const hop = flow?.steps[step];
    if (!index || !flow || !hop) return;
    const view = hopView(index, hop);
    set({
      flowStep: step,
      scope: view.scope,
      // The inspector follows the hop, so the connection's evidence is always in view.
      selection: hop.connection
        ? { type: "edge", key: hop.connection, connections: [hop.connection] }
        : null,
      announcement: `Step ${step + 1} of ${flow.steps.length}: ${hop.caption}${hop.gap ? `. Gap: ${hop.gap}` : ""}`,
    });
  },
  setPlaying: (playing) => set({ playing }),
  toggleTheme: () => {
    const theme: Theme = get().theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("archeion-theme", theme);
    } catch {
      // The choice simply lasts for this session.
    }
    set({ theme });
  },
  setLeft: (left) => set({ left }),
  setActiveTrail: (activeTrail) => set({ activeTrail }),
  announce: (announcement) => set({ announcement }),
}));

export const scopeKey = (scope: string | null) => scope ?? "(root)";

export function scopePath(index: GraphIndex, scope: string | null): (string | null)[] {
  return scope ? [null, ...pathTo(index, scope)] : [null];
}
