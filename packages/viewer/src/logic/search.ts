// Sonar: deterministic local search over prepared descriptions; no model, no network.
// Rule: every meaningful query word must appear in some field. A word scores the weight of the
// strongest field it appears in, and results rank by total score, then id.
import type { Part } from "@archeion/core/contracts";
import type { GraphIndex } from "./graphIndex";

export type SearchField = "name" | "reuse" | "does" | "tech" | "about" | "topics" | "repo";

const WEIGHTS: Record<SearchField, number> = {
  name: 5,
  reuse: 4,
  does: 3,
  topics: 3,
  tech: 2,
  about: 1,
  repo: 1,
};
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "of",
  "in",
  "on",
  "that",
  "which",
  "and",
]);

export interface SearchResult {
  part: string;
  score: number;
  matched: SearchField[];
}

function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9#.+-]+/)
    .filter((word) => word && !STOP_WORDS.has(word))
    .map((word) => (word.length > 3 ? word.replace(/s$/, "") : word));
}

function fieldsOf(part: Part, repos: Map<string, string>): Record<SearchField, string> {
  return {
    name: part.name.toLowerCase(),
    reuse: part.reuse.join(" ").toLowerCase(),
    does: part.does.toLowerCase(),
    tech: (part.tech ?? "").toLowerCase(),
    about: (part.about ?? "").toLowerCase(),
    topics: part.topics.join(" ").toLowerCase(),
    repo: part.repos
      .map((id) => `${id} ${repos.get(id) ?? ""}`)
      .join(" ")
      .toLowerCase(),
  };
}

export function search(index: GraphIndex, query: string): SearchResult[] {
  const words = queryWords(query);
  if (words.length === 0) return [];
  const results: SearchResult[] = [];
  const repos = new Map(index.graph.repos.map((repo) => [repo.id, repo.name]));
  for (const part of index.graph.parts) {
    if (part.kind === "unknown") continue;
    const fields = fieldsOf(part, repos);
    const matched = new Set<SearchField>();
    let score = 0;
    let everyWord = true;
    for (const word of words) {
      let best = 0;
      for (const field of Object.keys(WEIGHTS) as SearchField[]) {
        if (!fields[field].includes(word)) continue;
        matched.add(field);
        best = Math.max(best, WEIGHTS[field]);
      }
      if (best === 0) {
        everyWord = false;
        break;
      }
      score += best;
    }
    if (everyWord) results.push({ part: part.id, score, matched: [...matched] });
  }
  return results.sort((a, b) => b.score - a.score || (a.part < b.part ? -1 : 1));
}

export type BrowseCategory = "all" | "reusable" | "services" | "resources";
export interface BrowseFilters {
  category?: BrowseCategory;
  topic?: string | null;
  repo?: string | null;
}

const SERVICES = new Set<Part["kind"]>(["app", "service", "api", "worker", "function"]);
const RESOURCES = new Set<Part["kind"]>([
  "database",
  "cache",
  "queue",
  "storage",
  "secrets",
  "external",
]);

/** Browse explicit graph metadata; categories never infer capabilities from prose. */
export function browse(index: GraphIndex, query = "", filters: BrowseFilters = {}): Part[] {
  const ranked = query.trim()
    ? search(index, query).flatMap((result) => {
        const part = index.parts.get(result.part);
        return part ? [part] : [];
      })
    : index.graph.parts
        .filter((part) => part.kind !== "unknown")
        .toSorted(
          (a, b) =>
            Number(b.reuse.length > 0) - Number(a.reuse.length > 0) || a.name.localeCompare(b.name),
        );
  return ranked.filter((part) => {
    if (filters.repo && !part.repos.includes(filters.repo)) return false;
    if (filters.topic && !part.topics.includes(filters.topic)) return false;
    if (filters.category === "reusable") return part.reuse.length > 0;
    if (filters.category === "services") return SERVICES.has(part.kind);
    if (filters.category === "resources") return part.resource !== null || RESOURCES.has(part.kind);
    return true;
  });
}
