import type { Flow, FlowStep } from "@archeion/core/contracts";
import { type GraphIndex, lowestCommonScope, type ScopeEdge, visibleIn } from "./graphIndex";

export interface HopView {
  scope: string | null;
  from: string | null;
  to: string | null;
}

/** A hop plays at the lowest zoom level where both of its ends are visible. */
export function hopView(index: GraphIndex, step: FlowStep): HopView {
  const hasFrom = index.parts.has(step.from);
  const hasTo = index.parts.has(step.to);
  if (hasFrom && hasTo) {
    const scope = lowestCommonScope(index, step.from, step.to);
    return {
      scope,
      from: visibleIn(index, scope, step.from),
      to: visibleIn(index, scope, step.to),
    };
  }
  const known = hasFrom ? step.from : hasTo ? step.to : null;
  if (!known) return { scope: null, from: null, to: null };
  const scope = index.parts.get(known)?.parent ?? null;
  return { scope, from: hasFrom ? known : null, to: hasTo ? known : null };
}

/** The edges in this scope that the flow has dyed so far, and the one it is on now. */
export function dyedEdges(
  edges: ScopeEdge[],
  flow: Flow | null,
  step: number | null,
): { passed: Set<string>; current: string | null } {
  const passed = new Set<string>();
  let current: string | null = null;
  if (!flow || step === null) return { passed, current };
  flow.steps.slice(0, step + 1).forEach((hop, i) => {
    if (!hop.connection) return;
    const edge = edges.find((e) => e.connections.includes(hop.connection as string));
    if (!edge) return;
    if (i === step) current = edge.key;
    else passed.add(edge.key);
  });
  return { passed, current };
}
