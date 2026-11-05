import type { Trail, TrailStep } from "@archeion/core/contracts";
import type { GraphIndex } from "./graphIndex";

/** The parts a saved view is about, with the fingerprints that later reveal changes. */
export function captureTargets(
  index: GraphIndex,
  selected: string | null,
  scope: string | null,
  extra: string[] = [],
): TrailStep["targets"] {
  const ids = new Set([selected ?? scope, ...extra].filter((id): id is string => id !== null));
  return [...ids].map((part) => ({
    part,
    fingerprint: index.parts.get(part)?.fingerprint ?? null,
  }));
}

export type TargetStatus = "unchanged" | "changed" | "removed" | "unavailable";

export interface TrailReport {
  targets: { part: string; name: string; status: TargetStatus }[];
  repos: { repo: string; status: "same" | "changed" | "unavailable"; sameCommit: boolean }[];
}

/** Missing evidence reads as unavailable, never as unchanged. */
export function compareTrail(trail: Trail, index: GraphIndex): TrailReport {
  const seen = new Map<string, string | null>();
  for (const step of trail.steps) {
    for (const target of step.targets) seen.set(target.part, target.fingerprint);
  }
  const targets = [...seen].map(([part, fingerprint]) => {
    const current = index.parts.get(part);
    const status: TargetStatus = !current
      ? "removed"
      : fingerprint === null
        ? "unavailable"
        : fingerprint === current.fingerprint
          ? "unchanged"
          : "changed";
    return { part, name: current?.name ?? part, status };
  });

  const repos = trail.snapshot.repos.map((saved) => {
    const current = index.graph.repos.find((r) => r.id === saved.repo);
    if (!current || saved.stateId === null || current.stateId === null) {
      return { repo: saved.repo, status: "unavailable" as const, sameCommit: false };
    }
    return {
      repo: saved.repo,
      status: saved.stateId === current.stateId ? ("same" as const) : ("changed" as const),
      sameCommit: saved.head === current.head,
    };
  });
  return { targets, repos };
}
