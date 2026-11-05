// Turns supplied per-repo Git facts into the comparison the Radar eye reads.
// Missing history or references stay `unavailable`: they never read as "nothing changed".
import type {
  Commit,
  Comparison,
  ComparisonRepo,
  Diagnostic,
  FileChange,
  PartChange,
} from "./contracts";
import { extractManifest, isManifest } from "./extract/documents";
import {
  KNOWLEDGE_DIR,
  type PartDeclaration,
  parseKnowledge,
  type RepoKnowledge,
  type SourceFile,
} from "./knowledge";

export interface GitCommitFacts extends Omit<Commit, "repo"> {
  files: string[];
}

export interface GitFacts {
  head: string | null;
  branch: string | null;
  stateId: string | null;
  comparison: Omit<ComparisonRepo, "repo">;
  commits: GitCommitFacts[];
  files: Omit<FileChange, "repo" | "parts">[];
  /** Knowledge and manifest files as they were at the baseline. */
  baselineFiles: { path: string; content: string }[];
}

interface CompareInput {
  repos: { id: string; files: SourceFile[]; git: GitFacts | null; knowledgeOnly?: boolean }[];
  knowledge: Map<string, RepoKnowledge>;
  partIds: Set<string>;
  ownersOf: (repo: string, file: string) => string[];
  diagnose: (
    severity: Diagnostic["severity"],
    code: string,
    message: string,
    where?: { repo?: string; file?: string; line?: number | null; part?: string },
  ) => void;
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function reviewedContent(part: PartDeclaration): string {
  const { file: _file, line: _line, repo: _repo, about: _about, ...fields } = part;
  return JSON.stringify(fields);
}

function manifestVersions(file: string, content: string): Map<string, string | null> {
  const versions = new Map<string, string | null>();
  for (const fact of extractManifest(file, content).facts) {
    if (fact.type === "dependency") versions.set(fact.name, fact.version);
  }
  return versions;
}

export function compareRepos(input: CompareInput): Comparison {
  const comparison: Comparison = {
    repos: [],
    files: [],
    commits: [],
    dependencies: [],
    parts: [],
    removedParts: [],
  };
  const changes = new Map<string, PartChange>();
  const mark = (
    part: string,
    status: PartChange["status"],
    local: boolean,
    committed: boolean,
    trailer: string | null = null,
  ) => {
    const existing = changes.get(part);
    if (!existing) {
      changes.set(part, { part, status, local, committed, agentTrailer: trailer });
      return;
    }
    if (status !== "changed") existing.status = status;
    existing.local ||= local;
    existing.committed ||= committed;
    existing.agentTrailer ??= trailer;
  };

  for (const repo of input.repos) {
    if (repo.knowledgeOnly) continue;
    if (!repo.git) {
      comparison.repos.push({
        repo: repo.id,
        status: "unavailable",
        reason: "This directory is not a Git repository, so no comparison exists.",
        defaultBranch: null,
        defaultBranchSource: "none",
        onDefaultBranch: false,
        baseline: null,
      });
      input.diagnose(
        "warning",
        "comparison-unavailable",
        "This directory is not a Git repository, so Radar has no comparison for it.",
        { repo: repo.id },
      );
      continue;
    }

    comparison.repos.push({ repo: repo.id, ...repo.git.comparison });
    if (repo.git.comparison.status === "unavailable") {
      input.diagnose(
        "warning",
        "comparison-unavailable",
        repo.git.comparison.reason ?? "No baseline could be resolved.",
        { repo: repo.id },
      );
      continue;
    }

    const fileChanges: FileChange[] = repo.git.files.map((file) => ({
      repo: repo.id,
      ...file,
      parts: input.ownersOf(repo.id, file.path),
    }));
    comparison.files.push(...fileChanges);

    const trailerByFile = new Map<string, string>();
    for (const { files, ...commit } of repo.git.commits) {
      comparison.commits.push({ repo: repo.id, ...commit });
      if (commit.agentTrailer) {
        for (const file of files) trailerByFile.set(file, commit.agentTrailer);
      }
    }

    for (const change of fileChanges) {
      const committed = change.stage === "committed";
      for (const part of change.parts)
        mark(part, "changed", !committed, committed, trailerByFile.get(change.path) ?? null);
    }

    // Architecture changes: compare reviewed declarations at the baseline with today's.
    const current = input.knowledge.get(repo.id);
    const baseline = parseKnowledge(repo.id, repo.git.baselineFiles);
    const baselineById = new Map(baseline.parts.map((p) => [p.id, p]));
    const knowledgeStage = (file: string) => {
      const stages = fileChanges.filter((c) => c.path === file);
      return {
        local: stages.some((c) => c.stage !== "committed"),
        committed: stages.some((c) => c.stage === "committed"),
      };
    };
    for (const part of current?.parts ?? []) {
      const before = baselineById.get(part.id);
      const stage = knowledgeStage(part.file);
      if (!before) {
        mark(part.id, "added", stage.local, stage.committed, trailerByFile.get(part.file) ?? null);
      } else if (reviewedContent(before) !== reviewedContent(part)) {
        mark(
          part.id,
          "changed",
          stage.local,
          stage.committed,
          trailerByFile.get(part.file) ?? null,
        );
      }
      baselineById.delete(part.id);
    }
    for (const removed of baselineById.values()) {
      // Moved to another connected repository is a change of ownership, not a removal.
      if (input.partIds.has(removed.id)) continue;
      const stage = knowledgeStage(removed.file);
      comparison.removedParts.push({
        id: removed.id,
        name: removed.name,
        kind: removed.kind,
        does: removed.does,
        parent: removed.parent,
        repo: repo.id,
      });
      mark(
        removed.id,
        "removed",
        stage.local,
        stage.committed,
        trailerByFile.get(removed.file) ?? null,
      );
    }

    // Dependency swaps: a styling-library replacement must be visible from the map.
    const manifests = new Set<string>();
    for (const f of repo.git.baselineFiles) if (isManifest(f.path)) manifests.add(f.path);
    for (const f of repo.files)
      if (isManifest(f.path) && !f.path.startsWith(KNOWLEDGE_DIR)) manifests.add(f.path);
    for (const manifest of manifests) {
      const before = repo.git.baselineFiles.find((f) => f.path === manifest)?.content;
      const after = repo.files.find((f) => f.path === manifest)?.content;
      const was = before ? manifestVersions(manifest, before) : new Map<string, string | null>();
      const now = after ? manifestVersions(manifest, after) : new Map<string, string | null>();
      const parts = input.ownersOf(repo.id, manifest);
      const stage = knowledgeStage(manifest);
      for (const name of new Set([...was.keys(), ...now.keys()])) {
        const from = was.get(name) ?? null;
        const to = now.get(name) ?? null;
        if (was.has(name) && now.has(name) && from === to) continue;
        comparison.dependencies.push({
          repo: repo.id,
          manifest,
          name,
          from,
          to,
          local: stage.local,
          parts,
        });
        for (const part of parts) mark(part, "changed", stage.local, stage.committed);
      }
    }
  }

  comparison.repos.sort((a, b) => compareText(a.repo, b.repo));
  comparison.files.sort((a, b) =>
    compareText(`${a.repo}|${a.path}|${a.stage}`, `${b.repo}|${b.path}|${b.stage}`),
  );
  comparison.dependencies.sort((a, b) =>
    compareText(`${a.repo}|${a.manifest}|${a.name}`, `${b.repo}|${b.manifest}|${b.name}`),
  );
  comparison.removedParts.sort((a, b) => compareText(a.id, b.id));
  comparison.parts = [...changes.values()].sort((a, b) => compareText(a.part, b.part));
  return comparison;
}
