// Combines reviewed knowledge and extracted facts into one deterministic, validated graph.
import { createHash } from "node:crypto";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { compareRepos, type GitFacts } from "./compare";
import {
  type Connection,
  type Coverage,
  type Dependency,
  type Diagnostic,
  type Evidence,
  type Extractor,
  type Flow,
  GRAPH_VERSION,
  type Graph,
  graphSchema,
  type Part,
  type PartKind,
  type Provenance,
  type Repo,
  type Trail,
  type Verb,
} from "./contracts";
import {
  extractArm,
  extractConfiguration,
  extractManifest,
  extractOpenApi,
  isArmTemplate,
  isConfigurationFile,
  isManifest,
} from "./extract/documents";
import type { Extraction, Fact, RouteFact, Unsupported } from "./extract/facts";
import { extractCSharp, extractTypeScript, type LoadedParsers } from "./extract/syntax";
import {
  KNOWLEDGE_DIR,
  type PartDeclaration,
  parseKnowledge,
  type RepoKnowledge,
  type SourceFile,
} from "./knowledge";

export interface RepoInput {
  id: string;
  name?: string;
  files: SourceFile[];
  git: GitFacts | null;
  /** Workspace-level knowledge with no source code of its own, so no comparison is expected. */
  knowledgeOnly?: boolean;
}

export interface BuildInput {
  workspace: { id: string; name: string };
  repos: RepoInput[];
  parsers: LoadedParsers;
  /** Input problems found before the core ran, such as a missing repository directory. */
  diagnostics?: Diagnostic[];
}

export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

export function serializeGraph(graph: Graph): string {
  return `${JSON.stringify(graph, null, 2)}\n`;
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const evidenceKey = (e: Evidence) =>
  `${e.repo}|${e.file}|${String(e.line ?? 0).padStart(8, "0")}|${e.kind}|${e.detail ?? ""}`;

function uniqueEvidence(items: Evidence[]): Evidence[] {
  const byKey = new Map(items.map((item) => [evidenceKey(item), item]));
  return [...byKey.keys()].sort(compareText).map((key) => byKey.get(key) as Evidence);
}

const RESOURCE_KINDS: Record<string, PartKind> = {
  "Microsoft.ServiceBus/namespaces": "queue",
  "Microsoft.Sql/servers": "database",
  "Microsoft.Storage/storageAccounts": "storage",
  "Microsoft.KeyVault/vaults": "secrets",
  "Microsoft.Cache/Redis": "cache",
  "Microsoft.DocumentDB/databaseAccounts": "database",
};

const combine = (a: Provenance, b: Provenance): Provenance => (a === b ? a : "both");

function routeMatches(template: string, actual: string): boolean {
  const normalize = (value: string) => value.split("?")[0]?.replace(/\/+$/, "").split("/") ?? [];
  const left = normalize(template);
  const right = normalize(actual);
  if (left.length !== right.length) return false;
  return left.every((segment, i) => /^\{.*\}$|^:/.test(segment) || segment === right[i]);
}

interface MutablePart extends Part {
  contract: { repo: string; path: string } | null;
  httpTargets: Record<string, string>;
}

function fromDeclaration(d: PartDeclaration): MutablePart {
  return {
    id: d.id,
    parent: d.parent,
    name: d.name,
    kind: d.kind,
    does: d.does,
    about: d.about,
    tech: d.tech,
    owner: d.owner,
    hasInside: false,
    repos: [d.repo],
    code: d.code.map((glob) => ({ repo: d.repo, glob })),
    // Copies: contributions and prose extend these, and the declaration must stay as written so
    // comparing it with the baseline sees only what its own file changed.
    rules: [...d.rules],
    reuse: [...d.reuse],
    topics: [...d.topics],
    resource: d.resource,
    dependencies: [],
    evidence: [{ kind: "knowledge", repo: d.repo, file: d.file, line: d.line, detail: null }],
    provenance: "reviewed",
    fingerprint: "",
    contract: d.contract ? { repo: d.repo, path: d.contract } : null,
    httpTargets: d.httpTargets,
  };
}

export async function buildGraph(input: BuildInput): Promise<Graph> {
  const repos = [...input.repos].sort((a, b) => compareText(a.id, b.id));
  const diagnostics: Diagnostic[] = [...(input.diagnostics ?? [])];
  const diagnose = (
    severity: Diagnostic["severity"],
    code: string,
    message: string,
    where: { repo?: string; file?: string; line?: number | null; part?: string } = {},
  ) =>
    diagnostics.push({
      severity,
      code,
      message,
      repo: where.repo ?? null,
      file: where.file ?? null,
      line: where.line ?? null,
      part: where.part ?? null,
    });

  // --- Knowledge -------------------------------------------------------------------------------
  const knowledge = new Map<string, RepoKnowledge>();
  for (const repo of repos) {
    const parsed = parseKnowledge(repo.id, repo.files);
    knowledge.set(repo.id, parsed);
    diagnostics.push(...parsed.diagnostics);
    if (!repo.knowledgeOnly && !repo.files.some((f) => f.path === `${KNOWLEDGE_DIR}system.md`)) {
      diagnose("warning", "missing-knowledge", "This repository has no .archeion/system.md yet.", {
        repo: repo.id,
      });
    }
  }

  const parts = new Map<string, MutablePart>();
  for (const k of knowledge.values()) {
    for (const declaration of k.parts) {
      const existing = parts.get(declaration.id);
      if (existing) {
        const first = existing.evidence[0];
        diagnose(
          "error",
          "duplicate-part",
          `Part id "${declaration.id}" is already declared in ${first?.repo}:${first?.file}. One reviewed declaration owns an id; use \`contributes\` to add evidence from another repository.`,
          {
            repo: declaration.repo,
            file: declaration.file,
            line: declaration.line,
            part: declaration.id,
          },
        );
        continue;
      }
      parts.set(declaration.id, fromDeclaration(declaration));
    }
  }

  for (const k of knowledge.values()) {
    for (const prose of k.prose) {
      const part = parts.get(prose.part);
      if (!part) {
        diagnose(
          "warning",
          "unresolved-part-file",
          `Part file describes "${prose.part}", which no map block declares.`,
          {
            repo: k.repo,
            part: prose.part,
          },
        );
        continue;
      }
      part.about = prose.about;
      part.rules = [...part.rules, ...prose.rules];
      part.reuse = [...part.reuse, ...prose.reuse];
    }
    for (const c of k.contributions) {
      const part = parts.get(c.part);
      if (!part) {
        diagnose(
          "warning",
          "unresolved-contribution",
          `\`contributes\` targets "${c.part}", which no map block declares.`,
          {
            repo: c.repo,
            file: c.file,
            line: c.line,
            part: c.part,
          },
        );
        continue;
      }
      part.code.push(...c.code.map((glob) => ({ repo: c.repo, glob })));
      part.reuse.push(...c.reuse);
      part.repos.push(c.repo);
      part.evidence.push({
        kind: "knowledge",
        repo: c.repo,
        file: c.file,
        line: c.line,
        detail: "contribution",
      });
    }
  }

  for (const part of parts.values()) {
    if (part.parent && !parts.has(part.parent)) {
      const first = part.evidence[0];
      diagnose(
        "error",
        "unresolved-parent",
        `Parent "${part.parent}" of part "${part.id}" is not declared.`,
        {
          repo: first?.repo,
          file: first?.file,
          line: first?.line,
          part: part.id,
        },
      );
      part.parent = null;
    }
    const seen = new Set([part.id]);
    for (let at = part.parent; at; at = parts.get(at)?.parent ?? null) {
      if (seen.has(at)) {
        diagnose("error", "parent-cycle", `Part "${part.id}" is inside itself through "${at}".`, {
          part: part.id,
        });
        part.parent = null;
        break;
      }
      seen.add(at);
    }
  }

  const ancestorsOf = (id: string): string[] => {
    const chain: string[] = [];
    for (let at = parts.get(id)?.parent ?? null; at; at = parts.get(at)?.parent ?? null)
      chain.push(at);
    return chain;
  };
  const depthOf = (id: string) => ancestorsOf(id).length;
  const isWithin = (id: string, container: string) =>
    id === container || ancestorsOf(id).includes(container);

  // --- Resource identity -----------------------------------------------------------------------
  const resourceKey = (type: string, identifier: string) => `${type}|${identifier.toLowerCase()}`;
  const resources = new Map<string, string>();
  for (const part of parts.values()) {
    if (!part.resource) continue;
    const key = resourceKey(part.resource.type, part.resource.identifier);
    const other = resources.get(key);
    if (other) {
      const first = part.evidence[0];
      diagnose(
        "error",
        "resource-identity-conflict",
        `Parts "${other}" and "${part.id}" both claim ${part.resource.type} "${part.resource.identifier}". One reviewed declaration owns a shared resource.`,
        { repo: first?.repo, file: first?.file, line: first?.line, part: part.id },
      );
      continue;
    }
    resources.set(key, part.id);
  }

  // --- Extraction ------------------------------------------------------------------------------
  const contractOwners = new Map<string, string>();
  for (const part of parts.values()) {
    if (part.contract) contractOwners.set(`${part.contract.repo}|${part.contract.path}`, part.id);
  }

  const coverage: Coverage[] = [];
  const allFacts: { repo: string; fact: Fact }[] = [];
  const liveFiles = new Map<string, SourceFile[]>();

  for (const repo of repos) {
    const ignore = knowledge.get(repo.id)?.ignore ?? [];
    const files = repo.files.filter(
      (f) =>
        !f.path.startsWith(KNOWLEDGE_DIR) && !ignore.some((g) => path.posix.matchesGlob(f.path, g)),
    );
    liveFiles.set(repo.id, files);

    const tally = new Map<
      Extractor,
      { scanned: number; facts: number; unsupported: Unsupported[] }
    >();
    for (const extractor of [
      "csharp",
      "typescript",
      "openapi",
      "arm",
      "configuration",
      "manifest",
    ] as Extractor[]) {
      tally.set(extractor, { scanned: 0, facts: 0, unsupported: [] });
    }
    const record = (extractor: Extractor, result: Extraction) => {
      const row = tally.get(extractor);
      if (!row) return;
      row.scanned += 1;
      row.facts += result.facts.length;
      row.unsupported.push(...result.unsupported);
      for (const fact of result.facts) allFacts.push({ repo: repo.id, fact });
    };

    for (const file of files) {
      if (file.content === null) continue;
      const lower = file.path.toLowerCase();
      if (lower.endsWith(".cs")) {
        record("csharp", extractCSharp(input.parsers.csharp, file.path, file.content));
      } else if (lower.endsWith(".tsx")) {
        record("typescript", extractTypeScript(input.parsers.tsx, file.path, file.content));
      } else if (lower.endsWith(".ts") && !lower.endsWith(".d.ts")) {
        record("typescript", extractTypeScript(input.parsers.typescript, file.path, file.content));
      } else if (contractOwners.has(`${repo.id}|${file.path}`)) {
        record("openapi", await extractOpenApi(file.path, file.content));
      } else if (isManifest(lower)) {
        record("manifest", extractManifest(file.path, file.content));
      } else if (isConfigurationFile(file.path)) {
        record("configuration", extractConfiguration(file.path, file.content));
      } else if (lower.endsWith(".json") && isArmTemplate(file.content)) {
        record("arm", extractArm(file.path, file.content));
      }
    }
    for (const part of parts.values()) {
      if (
        part.contract?.repo === repo.id &&
        !repo.files.some((f) => f.path === part.contract?.path)
      ) {
        const first = part.evidence[0];
        diagnose(
          "warning",
          "contract-missing",
          `Contract ${part.contract.path} of part "${part.id}" does not exist.`,
          {
            repo: repo.id,
            file: first?.file,
            line: first?.line,
            part: part.id,
          },
        );
      }
    }
    for (const [extractor, row] of tally) {
      coverage.push({
        repo: repo.id,
        extractor,
        filesScanned: row.scanned,
        facts: row.facts,
        status: row.unsupported.length > 0 ? "partial" : "complete",
        unsupported: row.unsupported
          .map(({ file, line, construct, message }) => ({ file, line, construct, message }))
          .sort((a, b) =>
            compareText(`${a.file}|${a.line}|${a.construct}`, `${b.file}|${b.line}|${b.construct}`),
          ),
      });
    }
  }

  /** The deepest parts whose `code` globs cover a file: parents are implied by containment. */
  const ownersOf = (repo: string, file: string): string[] => {
    let best: string[] = [];
    let bestDepth = -1;
    for (const part of parts.values()) {
      if (!part.code.some((c) => c.repo === repo && path.posix.matchesGlob(file, c.glob))) continue;
      const depth = depthOf(part.id);
      if (depth > bestDepth) {
        best = [part.id];
        bestDepth = depth;
      } else if (depth === bestDepth) {
        best.push(part.id);
      }
    }
    return best.sort(compareText);
  };

  const connections = new Map<string, Connection>();
  const connect = (
    from: string,
    verb: Verb,
    to: string,
    fields: { via: string | null; provenance: Provenance; evidence: Evidence[]; reason?: string },
  ) => {
    const id = `${from}|${verb}|${to}`;
    const existing = connections.get(id);
    const resolution = fields.reason ? "unknown" : "resolved";
    if (!existing) {
      connections.set(id, {
        id,
        from,
        to,
        verb,
        via: fields.via,
        provenance: fields.provenance,
        resolution,
        reason: fields.reason ?? null,
        crossRepo: false,
        evidence: fields.evidence,
      });
      return;
    }
    existing.provenance = combine(existing.provenance, fields.provenance);
    existing.evidence.push(...fields.evidence);
    if (fields.via && !existing.via?.split(", ").includes(fields.via)) {
      existing.via = existing.via ? `${existing.via}, ${fields.via}` : fields.via;
    }
    if (existing.resolution === "unknown" && resolution === "resolved") {
      existing.resolution = "resolved";
      existing.reason = null;
    }
  };

  // Attribute facts to owning parts.
  const routes: { part: string; repo: string; fact: RouteFact }[] = [];
  const unmapped = new Map<string, Unsupported>();
  const noteUnmapped = (repo: string, fact: Fact, extractor: Extractor) => {
    unmapped.set(`${repo}|${fact.file}`, {
      extractor,
      file: fact.file,
      line: null,
      construct: "unmapped file",
      message: "No part's `code` globs cover this file, so its facts are not attributed to a part.",
    });
  };

  for (const { repo, fact } of allFacts) {
    if (fact.type !== "route") continue;
    const owner = contractOwners.get(`${repo}|${fact.file}`) ?? ownersOf(repo, fact.file)[0];
    if (!owner) {
      noteUnmapped(repo, fact, fact.evidence === "contract" ? "openapi" : "csharp");
      continue;
    }
    routes.push({ part: owner, repo, fact });
    const part = parts.get(owner) as MutablePart;
    part.evidence.push({
      kind: fact.evidence,
      repo,
      file: fact.file,
      line: fact.line,
      detail: `${fact.method} ${fact.path}`,
    });
    if (part.provenance === "reviewed") part.provenance = "both";
  }

  const stubPart = (
    id: string,
    name: string,
    parent: string | null,
    evidence: Evidence,
    does: string,
  ) => {
    if (parts.has(id)) {
      (parts.get(id) as MutablePart).evidence.push(evidence);
      return;
    }
    parts.set(id, {
      id,
      parent,
      name,
      kind: "unknown",
      does,
      about: null,
      tech: null,
      owner: null,
      hasInside: false,
      repos: [evidence.repo],
      code: [],
      rules: [],
      reuse: [],
      topics: [],
      resource: null,
      dependencies: [],
      evidence: [evidence],
      provenance: evidence.kind === "knowledge" ? "reviewed" : "extracted",
      fingerprint: "",
      contract: null,
      httpTargets: {},
    });
  };

  // Declared links first, so extracted facts can corroborate them.
  for (const k of knowledge.values()) {
    for (const link of k.links) {
      const evidence: Evidence = {
        kind: "knowledge",
        repo: link.repo,
        file: link.file,
        line: link.line,
        detail: null,
      };
      const resolve = (raw: string, other: string) => {
        if (parts.has(raw)) return { id: raw, missing: false };
        const stub = `unknown:${raw}`;
        stubPart(
          stub,
          raw,
          parts.get(other)?.parent ?? null,
          evidence,
          "Referenced by reviewed knowledge but not declared in any connected repository.",
        );
        return { id: stub, missing: true };
      };
      const from = resolve(link.from, link.to);
      const to = resolve(link.to, link.from);
      const missing = from.missing ? link.from : to.missing ? link.to : null;
      if (missing) {
        diagnose(
          "warning",
          "unresolved-ref",
          `"${missing}" is not declared in any connected repository.`,
          {
            repo: link.repo,
            file: link.file,
            line: link.line,
            part: from.missing ? to.id : from.id,
          },
        );
      }
      connect(from.id, link.verb, to.id, {
        via: link.via,
        provenance: "reviewed",
        evidence: [evidence],
        ...(missing ? { reason: `"${missing}" is not declared in any connected repository.` } : {}),
      });
    }
  }

  const corroborateAncestors = (from: string, to: string, evidence: Evidence[]) => {
    const froms = [from, ...ancestorsOf(from)];
    const tos = [to, ...ancestorsOf(to)];
    for (const connection of connections.values()) {
      if (connection.from === from && connection.to === to) continue;
      if (froms.includes(connection.from) && tos.includes(connection.to)) {
        connection.provenance = combine(connection.provenance, "extracted");
        connection.evidence.push(...evidence);
      }
    }
  };

  for (const { repo, fact } of allFacts) {
    if (fact.type === "route") continue;

    if (fact.type === "resource") {
      const key = resourceKey(fact.resourceType, fact.identifier);
      let target = resources.get(key);
      const evidence: Evidence = {
        kind: fact.evidence,
        repo,
        file: fact.file,
        line: fact.line,
        detail: fact.detail ? `${fact.identifier} (${fact.detail})` : fact.identifier,
      };
      if (target) {
        const part = parts.get(target) as MutablePart;
        part.provenance = combine(part.provenance, "extracted");
      } else {
        target = `azure:${fact.resourceType}:${fact.identifier.toLowerCase()}`;
        resources.set(key, target);
        parts.set(target, {
          id: target,
          parent: null,
          name: fact.identifier,
          kind: RESOURCE_KINDS[fact.resourceType] ?? "external",
          does: "Found in repository evidence; no reviewed description yet.",
          about: null,
          tech: fact.resourceType,
          owner: null,
          hasInside: false,
          repos: [repo],
          code: [],
          rules: [],
          reuse: [],
          topics: [],
          resource: { provider: "azure", type: fact.resourceType, identifier: fact.identifier },
          dependencies: [],
          evidence: [],
          provenance: "extracted",
          fingerprint: "",
          contract: null,
          httpTargets: {},
        });
      }
      const resourcePart = parts.get(target) as MutablePart;
      resourcePart.evidence.push(evidence);
      resourcePart.repos.push(repo);

      if (fact.evidence === "configuration") {
        const owner = ownersOf(repo, fact.file)[0];
        if (!owner) {
          noteUnmapped(repo, fact, "configuration");
          continue;
        }
        const direct = [...connections.values()].find((c) => c.from === owner && c.to === target);
        if (direct) {
          direct.provenance = combine(direct.provenance, "extracted");
          direct.evidence.push(evidence);
        } else {
          connect(owner, "uses", target, {
            via: null,
            provenance: "extracted",
            evidence: [evidence],
          });
          corroborateAncestors(owner, target, [evidence]);
        }
      }
      continue;
    }

    const owner = ownersOf(repo, fact.file)[0];
    if (!owner) {
      const extractor: Extractor =
        fact.type === "dependency"
          ? "manifest"
          : fact.file.endsWith(".cs")
            ? "csharp"
            : "typescript";
      noteUnmapped(repo, fact, extractor);
      continue;
    }
    const part = parts.get(owner) as MutablePart;
    if (part.provenance === "reviewed") part.provenance = "both";

    if (fact.type === "dependency") {
      const dependency: Dependency = {
        name: fact.name,
        version: fact.version,
        repo,
        manifest: fact.file,
      };
      part.dependencies.push(dependency);
      part.evidence.push({
        kind: "manifest",
        repo,
        file: fact.file,
        line: fact.line,
        detail: `${fact.name} ${fact.version ?? ""}`.trim(),
      });
      continue;
    }

    if (fact.type === "topic") {
      const verb: Verb = fact.direction === "publish" ? "publishes" : "consumes";
      const evidence: Evidence = {
        kind: "code",
        repo,
        file: fact.file,
        line: fact.line,
        detail: `${verb} ${fact.topic}`,
      };
      part.evidence.push(evidence);
      const brokers = [...parts.values()].filter((p) => p.topics.includes(fact.topic));
      if (brokers.length === 1) {
        const broker = brokers[0] as MutablePart;
        broker.provenance = combine(broker.provenance, "extracted");
        connect(owner, verb, broker.id, {
          via: fact.topic,
          provenance: "extracted",
          evidence: [evidence],
        });
        corroborateAncestors(owner, broker.id, [evidence]);
      } else {
        const reason =
          brokers.length === 0
            ? `No known broker declares topic "${fact.topic}".`
            : `Topic "${fact.topic}" is declared by ${brokers.length} brokers, so the link is ambiguous.`;
        const stub = `unknown:topic:${fact.topic}`;
        stubPart(
          stub,
          fact.topic,
          part.parent,
          evidence,
          "A topic found in code with no single known broker.",
        );
        connect(owner, verb, stub, {
          via: fact.topic,
          provenance: "extracted",
          evidence: [evidence],
          reason,
        });
        diagnose("warning", "unknown-connection", reason, {
          repo,
          file: fact.file,
          line: fact.line,
          part: owner,
        });
      }
      continue;
    }

    // HTTP call: linking needs target context as well as method and path.
    const callEvidence: Evidence = {
      kind: "code",
      repo,
      file: fact.file,
      line: fact.line,
      detail: `${fact.method} ${fact.path}`,
    };
    part.evidence.push(callEvidence);
    let target: string | null = null;
    let prefixLength = -1;
    let prefixText = "";
    for (const at of [owner, ...ancestorsOf(owner)]) {
      for (const [prefix, candidate] of Object.entries(
        (parts.get(at) as MutablePart).httpTargets,
      )) {
        if (fact.path.startsWith(prefix) && prefix.length > prefixLength) {
          target = candidate;
          prefixLength = prefix.length;
          prefixText = prefix;
        }
      }
      if (target) break;
    }
    if (!target || !parts.has(target)) {
      const reason = target
        ? `httpTargets names "${target}", which is not declared.`
        : `No target context for ${fact.method} ${fact.path}; add httpTargets to say which part serves it.`;
      const stub = `unknown:http:${fact.method} ${fact.path}`;
      stubPart(
        stub,
        `${fact.method} ${fact.path}`,
        part.parent,
        callEvidence,
        "An HTTP call found in code whose target is not established.",
      );
      connect(owner, "calls", stub, {
        via: `${fact.method} ${fact.path}`,
        provenance: "extracted",
        evidence: [callEvidence],
        reason,
      });
      diagnose("warning", "unknown-connection", reason, {
        repo,
        file: fact.file,
        line: fact.line,
        part: owner,
      });
      continue;
    }
    const servedBy = routes.filter((r) => isWithin(r.part, target as string));
    const stripped = fact.path.slice(prefixText.length) || "/";
    const matches = servedBy.filter(
      (r) =>
        r.fact.method === fact.method &&
        (routeMatches(r.fact.path, fact.path) || routeMatches(r.fact.path, stripped)),
    );
    const match = matches[0];
    if (match) {
      const routeEvidence: Evidence[] = matches.map((m) => ({
        kind: m.fact.evidence,
        repo: m.repo,
        file: m.fact.file,
        line: m.fact.line,
        detail: `${m.fact.method} ${m.fact.path}`,
      }));
      connect(owner, "calls", match.part, {
        via: `${fact.method} ${match.fact.path}`,
        provenance: "extracted",
        evidence: [callEvidence, ...routeEvidence],
      });
      corroborateAncestors(owner, match.part, [callEvidence, ...routeEvidence]);
    } else if (servedBy.length === 0) {
      connect(owner, "calls", target, {
        via: `${fact.method} ${fact.path}`,
        provenance: "extracted",
        evidence: [callEvidence],
      });
      corroborateAncestors(owner, target, [callEvidence]);
    } else {
      const reason = `No supported route on "${target}" matches ${fact.method} ${fact.path}.`;
      connect(owner, "calls", target, {
        via: `${fact.method} ${fact.path}`,
        provenance: "extracted",
        evidence: [callEvidence],
        reason,
      });
      diagnose("warning", "unknown-connection", reason, {
        repo,
        file: fact.file,
        line: fact.line,
        part: owner,
      });
    }
  }

  // A declared route that supported evidence cannot find is worth a look, not a removed link.
  for (const connection of connections.values()) {
    const via = connection.via?.match(/^([A-Z]+) (\/\S*)$/);
    if (!via || connection.provenance !== "reviewed") continue;
    const served = routes.filter((r) => isWithin(r.part, connection.to));
    if (
      served.length > 0 &&
      !served.some((r) => r.fact.method === via[1] && routeMatches(r.fact.path, via[2] as string))
    ) {
      const first = connection.evidence[0];
      diagnose(
        "warning",
        "declared-route-not-found",
        `Reviewed link says ${connection.via}, but no supported route on "${connection.to}" matches.`,
        {
          repo: first?.repo,
          file: first?.file,
          line: first?.line,
        },
      );
    }
  }

  // Source files as part evidence.
  const fileHashes = new Map<string, string[]>();
  for (const [repo, files] of liveFiles) {
    for (const file of files) {
      for (const owner of ownersOf(repo, file.path)) {
        (parts.get(owner) as MutablePart).evidence.push({
          kind: "code",
          repo,
          file: file.path,
          line: null,
          detail: null,
        });
      }
      for (const part of parts.values()) {
        if (part.code.some((c) => c.repo === repo && path.posix.matchesGlob(file.path, c.glob))) {
          const list = fileHashes.get(part.id) ?? [];
          list.push(`${repo}|${file.path}|${file.hash}`);
          fileHashes.set(part.id, list);
        }
      }
    }
  }

  // Merge unmapped-file notes into coverage.
  for (const key of [...unmapped.keys()].sort(compareText)) {
    const [repo] = key.split("|");
    const note = unmapped.get(key) as Unsupported;
    const row = coverage.find((c) => c.repo === repo && c.extractor === note.extractor);
    if (row) {
      row.unsupported.push({
        file: note.file,
        line: null,
        construct: note.construct,
        message: note.message,
      });
      row.status = "partial";
    }
  }

  // --- Flows -----------------------------------------------------------------------------------
  const flows: Flow[] = [];
  for (const k of knowledge.values()) {
    for (const declaration of k.flows) {
      const flow: Flow = {
        id: declaration.id,
        name: declaration.name,
        does: declaration.does,
        evidence: [
          {
            kind: "knowledge",
            repo: k.repo,
            file: declaration.file,
            line: declaration.line,
            detail: null,
          },
        ],
        steps: declaration.steps.map((step) => {
          const connection = connections.get(`${step.from}|${step.verb}|${step.to}`);
          let gap: string | null = null;
          if (!parts.has(step.from) || !parts.has(step.to)) {
            gap = `"${parts.has(step.from) ? step.to : step.from}" is not declared.`;
          } else if (!connection) {
            gap = `No connection supports "${step.from} ${step.verb} ${step.to}".`;
          } else if (connection.resolution === "unknown") {
            gap = connection.reason;
          }
          if (gap) {
            diagnose("warning", "flow-step-without-link", `Flow "${declaration.id}": ${gap}`, {
              repo: k.repo,
              file: declaration.file,
              line: step.line,
            });
          }
          return {
            from: step.from,
            to: step.to,
            verb: step.verb,
            caption: step.caption,
            connection: gap ? null : (connection?.id ?? null),
            gap,
          };
        }),
      };
      flows.push(flow);
    }
  }

  // --- Comparison ------------------------------------------------------------------------------
  const comparison = compareRepos({
    repos,
    knowledge,
    partIds: new Set(parts.keys()),
    ownersOf,
    diagnose,
  });

  // --- Finalize --------------------------------------------------------------------------------
  const children = new Map<string, string[]>();
  for (const part of parts.values()) {
    if (part.parent) children.set(part.parent, [...(children.get(part.parent) ?? []), part.id]);
  }
  for (const part of parts.values()) part.hasInside = children.has(part.id);

  for (const connection of connections.values()) {
    const from = parts.get(connection.from) as MutablePart;
    const to = parts.get(connection.to) as MutablePart;
    // repos[0] is the declaring repository; later entries only add evidence.
    connection.crossRepo = from.repos[0] !== to.repos[0];
    connection.evidence = uniqueEvidence(connection.evidence);
  }

  // Fingerprint bottom-up so a trail on a container notices changes inside it.
  const finished = new Map<string, string>();
  const fingerprint = (id: string): string => {
    const done = finished.get(id);
    if (done) return done;
    const part = parts.get(id) as MutablePart;
    const outgoing = [...connections.values()]
      .filter((c) => c.from === id)
      .map((c) => `${c.id}|${c.via ?? ""}|${c.resolution}`)
      .sort(compareText);
    const value = sha256(
      JSON.stringify({
        architecture: {
          parent: part.parent,
          name: part.name,
          kind: part.kind,
          does: part.does,
          tech: part.tech,
          rules: part.rules,
          reuse: part.reuse,
          resource: part.resource,
          outgoing,
        },
        source: (fileHashes.get(id) ?? []).sort(compareText),
        children: (children.get(id) ?? []).sort(compareText).map(fingerprint),
      }),
    ).slice(0, 16);
    finished.set(id, value);
    return value;
  };

  const finalParts: Part[] = [...parts.values()]
    .map(({ contract: _contract, httpTargets: _targets, ...part }) => ({
      ...part,
      fingerprint: fingerprint(part.id),
      repos: [...new Set(part.repos)].sort(compareText),
      code: [...part.code].sort((a, b) =>
        compareText(`${a.repo}|${a.glob}`, `${b.repo}|${b.glob}`),
      ),
      topics: [...part.topics].sort(compareText),
      reuse: [...new Set(part.reuse)],
      rules: [...new Set(part.rules)],
      dependencies: part.dependencies.sort((a, b) =>
        compareText(`${a.repo}|${a.manifest}|${a.name}`, `${b.repo}|${b.manifest}|${b.name}`),
      ),
      evidence: uniqueEvidence(part.evidence),
    }))
    .sort((a, b) => compareText(a.id, b.id));

  const finalRepos: Repo[] = repos.map((repo) => ({
    id: repo.id,
    name: repo.name ?? knowledge.get(repo.id)?.name ?? repo.id,
    git: repo.git !== null,
    head: repo.git?.head ?? null,
    branch: repo.git?.branch ?? null,
    stateId: repo.git?.stateId ?? null,
  }));

  const diagnosticKey = (d: Diagnostic) =>
    `${d.severity}|${d.repo ?? ""}|${d.file ?? ""}|${String(d.line ?? 0).padStart(8, "0")}|${d.code}|${d.message}`;
  const seenDiagnostics = new Map(diagnostics.map((d) => [diagnosticKey(d), d]));

  return graphSchema.parse({
    version: GRAPH_VERSION,
    workspace: input.workspace,
    repos: finalRepos,
    parts: finalParts,
    connections: [...connections.values()].sort((a, b) => compareText(a.id, b.id)),
    flows: flows.sort((a, b) => compareText(a.id, b.id)),
    coverage,
    comparison,
    trails: [...knowledge.values()]
      .flatMap((k) => k.trails)
      .sort((a, b) => compareText(a.id, b.id)),
    diagnostics: [...seenDiagnostics.keys()]
      .sort(compareText)
      .map((key) => seenDiagnostics.get(key)),
  } satisfies Record<keyof Graph, unknown>);
}

// --- Trails ----------------------------------------------------------------------------------

/** Renders an exported trail as the small Markdown artifact the owner reviews and commits. */
export function renderTrail(trail: Trail): string {
  const frontmatter = stringifyYaml({
    id: trail.id,
    title: trail.title,
    question: trail.question,
    finding: trail.finding,
    author: trail.author,
    snapshot: trail.snapshot,
  }).trimEnd();
  const steps = stringifyYaml({ steps: trail.steps }).trimEnd();
  return `---\n${frontmatter}\n---\n# ${trail.title}\n\n\`\`\`archeion\n${steps}\n\`\`\`\n`;
}

export function trailFileName(trail: Trail): string {
  return `${KNOWLEDGE_DIR}trails/${trail.id}.md`;
}

export const parseError = (error: z.ZodError) => z.prettifyError(error);
