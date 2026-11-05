import type { GraphIndex } from "./graphIndex";

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One glance: what this is, what changed against which baseline, and what is unknown. */
export function statusSentence(index: GraphIndex): string {
  const { graph } = index;
  const parts = graph.parts.filter((p) => p.kind !== "unknown").length;
  const { repos, parts: changed } = graph.comparison;
  const sourceCount = repos.length || graph.repos.length;
  const sections = [`${count(parts, "part")} in ${count(sourceCount, "repo")}`];

  const available = repos.filter((r) => r.status === "available");
  if (available.length === 0) {
    sections.push("comparison unavailable");
  } else {
    const refs = new Set(available.map((r) => r.baseline?.ref));
    const since = refs.size === 1 ? `since ${[...refs][0]}` : "since each repo's baseline";
    const agent = changed.filter((c) => c.agentTrailer).length;
    let summary = changed.length === 0 ? "no changes" : `${count(changed.length, "part")} changed`;
    if (agent > 0) summary += `, ${agent} with an agent trailer`;
    sections.push(`${since}: ${summary}`);
    if (available.length < repos.length) {
      sections.push(
        `comparison unavailable for ${repos.length - available.length} of ${repos.length} repos`,
      );
    }
  }

  const unknown = graph.connections.filter((c) => c.resolution === "unknown").length;
  if (unknown > 0) sections.push(count(unknown, "unknown link"));
  return sections.join(" · ");
}
