// Decides what lights up. Lights-out by default: a part is quiet unless the current eye's
// question makes it relevant, and colour is always doubled by a shape or text.
import type { Eye, Flow } from "@archeion/core/contracts";
import { type GraphIndex, pathTo, scopeGraph, visibleIn } from "./graphIndex";

export type Tone = "quiet" | "dim" | "context" | "focus";

export interface PartVisual {
  tone: Tone;
  /** Summary for results hidden inside a collapsed part. */
  badge: string | null;
  blip: "none" | "solid" | "hollow";
  tag: string | null;
  agent: boolean;
}

export interface EmphasisInput {
  eye: Eye;
  scope: string | null;
  selected: string | null;
  matches: string[];
  flow: Flow | null;
  flowStep: number | null;
}

const quiet = (): PartVisual => ({
  tone: "quiet",
  badge: null,
  blip: "none",
  tag: null,
  agent: false,
});

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many} inside`;

export function partVisuals(index: GraphIndex, input: EmphasisInput): Map<string, PartVisual> {
  const visuals = new Map<string, PartVisual>();
  for (const id of index.parts.keys()) visuals.set(id, quiet());
  const at = (id: string) => visuals.get(id);

  if (input.eye === "radar") {
    for (const visual of visuals.values()) visual.tone = "dim";
    const inside = new Map<string, number>();
    const removedParents = new Map(
      index.graph.comparison.removedParts.map((p) => [p.id, p.parent]),
    );
    for (const change of index.changes.values()) {
      const chain = index.parts.has(change.part)
        ? pathTo(index, change.part).slice(0, -1)
        : pathTo(index, removedParents.get(change.part) ?? "");
      for (const ancestor of chain) inside.set(ancestor, (inside.get(ancestor) ?? 0) + 1);
      const visual = at(change.part);
      if (!visual) continue;
      visual.tone = "focus";
      visual.blip = change.committed ? "solid" : "hollow";
      visual.agent = change.agentTrailer !== null;
      visual.tag =
        change.status === "added"
          ? "new"
          : change.status === "removed"
            ? "removed"
            : change.committed && change.local
              ? "changed + local"
              : change.local
                ? "local"
                : "changed";
    }
    for (const [id, count] of inside) {
      const visual = at(id);
      if (!visual) continue;
      visual.tone = "focus";
      visual.badge = plural(count, "changed", "changed");
    }
    // Connected neighbours are context to inspect, not proven impact.
    for (const edge of scopeGraph(index, input.scope).edges) {
      const from = at(edge.from);
      const to = at(edge.to);
      if (from?.tone === "focus" && to?.tone === "dim") to.tone = "context";
      if (to?.tone === "focus" && from?.tone === "dim") from.tone = "context";
    }
  } else if (input.eye === "sonar" && input.matches.length > 0) {
    for (const visual of visuals.values()) visual.tone = "dim";
    const inside = new Map<string, number>();
    for (const id of input.matches) {
      const visual = at(id);
      if (visual) visual.tone = "focus";
      for (const ancestor of pathTo(index, id).slice(0, -1)) {
        inside.set(ancestor, (inside.get(ancestor) ?? 0) + 1);
      }
    }
    for (const [id, count] of inside) {
      const visual = at(id);
      if (!visual) continue;
      visual.tone = "focus";
      visual.badge = plural(count, "match", "matches");
    }
  } else if (input.eye === "tracer" && input.flow && input.flowStep !== null) {
    for (const visual of visuals.values()) visual.tone = "dim";
    input.flow.steps.slice(0, input.flowStep + 1).forEach((step, i) => {
      const tone: Tone = i === input.flowStep ? "focus" : "context";
      for (const end of [step.from, step.to]) {
        const visual = at(end);
        const visible = visibleIn(index, input.scope, end);
        for (const target of [visual, visible ? at(visible) : undefined]) {
          if (target && target.tone !== "focus") target.tone = tone;
        }
      }
    });
  }

  if (input.selected) {
    const visual = at(input.selected);
    if (visual) visual.tone = "focus";
  }
  return visuals;
}

export interface TriageMark {
  severity: "error" | "warning";
  count: number;
}

const MAX_LIT_MARKS = 3;

/** One problem, one mark; at most three lit per view, with the rest counted in a summary. */
export function triage(
  index: GraphIndex,
  visible: string[],
): { marks: Map<string, TriageMark>; hidden: number } {
  const totals = new Map<string, TriageMark>();
  const visibleSet = new Set(visible);
  for (const [part, diagnostics] of index.diagnostics) {
    const owner = pathTo(index, part).find((id) => visibleSet.has(id));
    if (!owner) continue;
    for (const diagnostic of diagnostics) {
      const mark = totals.get(owner);
      if (mark) {
        mark.count += 1;
        if (diagnostic.severity === "error") mark.severity = "error";
      } else {
        totals.set(owner, { severity: diagnostic.severity, count: 1 });
      }
    }
  }
  const ranked = [...totals.entries()].sort(
    ([aId, a], [bId, b]) =>
      Number(b.severity === "error") - Number(a.severity === "error") ||
      b.count - a.count ||
      (aId < bId ? -1 : 1),
  );
  return {
    marks: new Map(ranked.slice(0, MAX_LIT_MARKS)),
    hidden: Math.max(0, ranked.length - MAX_LIT_MARKS),
  };
}
