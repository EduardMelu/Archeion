import { type Connection, GRAPH_VERSION, type Graph, type Part } from "@archeion/core/contracts";

export function part(id: string, parent: string | null, extra: Partial<Part> = {}): Part {
  return {
    id,
    parent,
    name: id,
    kind: "module",
    does: "",
    about: null,
    tech: null,
    owner: null,
    hasInside: false,
    repos: ["r"],
    code: [],
    rules: [],
    reuse: [],
    topics: [],
    resource: null,
    dependencies: [],
    evidence: [],
    provenance: "reviewed",
    fingerprint: `fp-${id}`,
    ...extra,
  };
}

export function link(from: string, to: string, extra: Partial<Connection> = {}): Connection {
  const verb = extra.verb ?? "calls";
  return {
    id: `${from}|${verb}|${to}`,
    from,
    to,
    verb,
    via: null,
    provenance: "reviewed",
    resolution: "resolved",
    reason: null,
    crossRepo: false,
    evidence: [],
    ...extra,
  };
}

/**
 * web (page-a, page-b)   ->   api (handler (deep), store-client)   ->   db
 *                                                 worker (mailer)  ->   db
 */
export function testGraph(overrides: Partial<Graph> = {}): Graph {
  return {
    version: GRAPH_VERSION,
    workspace: { id: "w", name: "Workspace" },
    repos: [
      { id: "r", name: "R", git: true, head: "abc1234567", branch: "feature", stateId: "s1" },
    ],
    parts: [
      part("web", null, { hasInside: true, kind: "app" }),
      part("page-a", "web"),
      part("page-b", "web"),
      part("api", null, { hasInside: true, kind: "service" }),
      part("handler", "api", { hasInside: true }),
      part("deep", "handler", {
        name: "Deep validator",
        does: "Checks totals and tax rules",
        reuse: ["Validate totals here"],
      }),
      part("store-client", "api"),
      part("worker", null, { hasInside: true, kind: "worker" }),
      part("mailer", "worker", {
        name: "Mailer",
        does: "Sends transactional email",
        tech: "SMTP",
        reuse: ["Use this to send email"],
      }),
      part("db", null, { kind: "database", tech: "Azure SQL" }),
      part("unknown:carrier", "worker", { kind: "unknown", name: "carrier" }),
    ],
    connections: [
      link("page-a", "handler"),
      link("page-b", "handler"),
      link("handler", "store-client", { verb: "uses" }),
      link("store-client", "db", { verb: "writes" }),
      link("mailer", "db", { verb: "reads" }),
      link("mailer", "unknown:carrier", { resolution: "unknown", reason: "Not declared." }),
    ],
    flows: [
      {
        id: "f",
        name: "Flow",
        does: "",
        evidence: [],
        steps: [
          {
            from: "page-a",
            to: "handler",
            verb: "calls",
            caption: "One",
            connection: "page-a|calls|handler",
            gap: null,
          },
          {
            from: "handler",
            to: "store-client",
            verb: "uses",
            caption: "Two",
            connection: "handler|uses|store-client",
            gap: null,
          },
          {
            from: "store-client",
            to: "db",
            verb: "writes",
            caption: "Three",
            connection: "store-client|writes|db",
            gap: null,
          },
          {
            from: "mailer",
            to: "unknown:carrier",
            verb: "calls",
            caption: "Four",
            connection: null,
            gap: "Not declared.",
          },
        ],
      },
    ],
    coverage: [],
    comparison: {
      repos: [
        {
          repo: "r",
          status: "available",
          reason: null,
          defaultBranch: "main",
          defaultBranchSource: "remote",
          onDefaultBranch: false,
          baseline: { ref: "main", sha: "def", kind: "merge-base" },
        },
      ],
      files: [],
      commits: [],
      dependencies: [],
      parts: [
        { part: "deep", status: "changed", committed: true, local: false, agentTrailer: null },
        {
          part: "store-client",
          status: "changed",
          committed: false,
          local: true,
          agentTrailer: null,
        },
        { part: "mailer", status: "added", committed: true, local: false, agentTrailer: "Claude" },
      ],
      removedParts: [],
    },
    trails: [],
    diagnostics: [],
    ...overrides,
  };
}
