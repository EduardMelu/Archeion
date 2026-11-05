// Git evidence through the installed binary: argument arrays only, shell disabled.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { type GitFacts, isManifest, KNOWLEDGE_DIR, sha256 } from "@archeion/core";

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function git(cwd: string, args: string[], signal?: AbortSignal): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-c", "core.quotepath=off", ...args],
      { cwd, shell: false, maxBuffer: 256 * 1024 * 1024, signal, windowsHide: true },
      (error, stdout, stderr) => resolve({ ok: !error, stdout, stderr }),
    );
  });
}

const AGENT_NAME = /claude|copilot|codex|cursor|devin|gemini|aider|\bagent\b|\bbot\b|\[bot\]/i;

function agentTrailer(coAuthors: string): string | null {
  const names = coAuthors
    .split(",")
    .map((value) => value.replace(/<.*>/, "").trim())
    .filter((value) => AGENT_NAME.test(value));
  return names[0] ?? null;
}

type Change = GitFacts["files"][number];

function parseNameStatus(output: string, stage: Change["stage"]): Change[] {
  const tokens = output.split("\0").filter(Boolean);
  const changes: Change[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const code = tokens[i] as string;
    if (code.startsWith("R") || code.startsWith("C")) {
      const previousPath = tokens[++i] as string;
      changes.push({ path: tokens[++i] as string, previousPath, status: "renamed", stage });
    } else {
      const status = code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified";
      changes.push({ path: tokens[++i] as string, previousPath: null, status, stage });
    }
  }
  return changes;
}

async function refExists(cwd: string, ref: string, signal?: AbortSignal): Promise<string | null> {
  if (ref.startsWith("-")) return null;
  const result = await git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], signal);
  return result.ok ? result.stdout.trim() : null;
}

interface DefaultBranch {
  name: string | null;
  ref: string | null;
  source: GitFacts["comparison"]["defaultBranchSource"];
}

async function resolveDefaultBranch(
  cwd: string,
  configured: string | undefined,
  signal?: AbortSignal,
): Promise<DefaultBranch> {
  const locate = async (name: string) => {
    if (await refExists(cwd, `refs/heads/${name}`, signal)) return name;
    if (await refExists(cwd, `refs/remotes/origin/${name}`, signal)) return `origin/${name}`;
    return null;
  };
  if (configured) {
    const ref = await locate(configured);
    return { name: configured, ref, source: "configured" };
  }
  const remote = await git(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], signal);
  if (remote.ok) {
    const name = remote.stdout.trim().replace(/^origin\//, "");
    return { name, ref: await locate(name), source: "remote" };
  }
  const init = await git(cwd, ["config", "init.defaultBranch"], signal);
  const candidates = [init.stdout.trim(), "main", "master", "trunk", "develop"].filter(Boolean);
  for (const name of candidates) {
    const ref = await locate(name);
    if (ref) return { name, ref, source: "inferred" };
  }
  const branches = await git(
    cwd,
    ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    signal,
  );
  const only = branches.stdout.split("\n").filter(Boolean);
  if (only.length === 1)
    return { name: only[0] as string, ref: only[0] as string, source: "inferred" };
  return { name: null, ref: null, source: "none" };
}

export interface GitOptions {
  defaultBranch?: string;
  base?: string;
  signal?: AbortSignal;
}

/** Returns null when `dir` is not inside a Git work tree. */
export async function collectGitFacts(
  dir: string,
  options: GitOptions = {},
): Promise<GitFacts | null> {
  const { signal } = options;
  const inside = await git(dir, ["rev-parse", "--is-inside-work-tree"], signal);
  if (!inside.ok || inside.stdout.trim() !== "true") return null;

  const headResult = await git(dir, ["rev-parse", "--verify", "--quiet", "HEAD"], signal);
  const head = headResult.ok ? headResult.stdout.trim() : null;
  const branchResult = await git(dir, ["symbolic-ref", "--short", "-q", "HEAD"], signal);
  const branch = branchResult.ok ? branchResult.stdout.trim() : null;
  const defaultBranch = await resolveDefaultBranch(dir, options.defaultBranch, signal);
  const onDefaultBranch = branch !== null && branch === defaultBranch.name;

  const unavailable = (reason: string, stateId: string | null): GitFacts => ({
    head,
    branch,
    stateId,
    comparison: {
      status: "unavailable",
      reason,
      defaultBranch: defaultBranch.name,
      defaultBranchSource: defaultBranch.source,
      onDefaultBranch,
      baseline: null,
    },
    commits: [],
    files: [],
    baselineFiles: [],
  });

  // Working-state identity comes from content, not just HEAD or a dirty boolean.
  const diffHead = head
    ? await git(dir, ["diff", "HEAD", "--binary", "--relative"], signal)
    : { stdout: "" };
  const untrackedResult = await git(
    dir,
    ["ls-files", "--others", "--exclude-standard", "-z"],
    signal,
  );
  const untracked = untrackedResult.stdout.split("\0").filter(Boolean).sort();
  const untrackedHashes: string[] = [];
  for (const file of untracked) {
    const content = await readFile(path.join(dir, file)).catch(() => null);
    untrackedHashes.push(`${file}|${content ? sha256(content) : "unreadable"}`);
  }
  const stateId = sha256(JSON.stringify([head, sha256(diffHead.stdout), untrackedHashes])).slice(
    0,
    16,
  );

  if (!head) return unavailable("This repository has no commits yet.", stateId);

  let baseline: GitFacts["comparison"]["baseline"] = null;
  if (options.base) {
    const sha = await refExists(dir, options.base, signal);
    if (!sha)
      return unavailable(`Reference "${options.base}" does not exist in this repository.`, stateId);
    baseline = { ref: options.base, sha, kind: "explicit" };
  } else if (onDefaultBranch) {
    baseline = { ref: "HEAD", sha: head, kind: "head" };
  } else {
    if (!defaultBranch.name) {
      return unavailable(
        "Could not resolve this repository's default branch. Set defaultBranch in workspace.yaml or pass --base.",
        stateId,
      );
    }
    if (!defaultBranch.ref) {
      return unavailable(
        `Default branch "${defaultBranch.name}" does not exist in this clone.`,
        stateId,
      );
    }
    const mergeBase = await git(dir, ["merge-base", "HEAD", defaultBranch.ref], signal);
    if (!mergeBase.ok) {
      return unavailable(
        `No common history with ${defaultBranch.ref}. The clone may be shallow, or the histories unrelated.`,
        stateId,
      );
    }
    baseline = { ref: defaultBranch.ref, sha: mergeBase.stdout.trim(), kind: "merge-base" };
  }

  const files: Change[] = [];
  if (baseline.sha !== head) {
    const committed = await git(
      dir,
      ["diff", "--name-status", "-M", "-z", "--relative", baseline.sha, "HEAD"],
      signal,
    );
    files.push(...parseNameStatus(committed.stdout, "committed"));
  }
  const staged = await git(
    dir,
    ["diff", "--cached", "--name-status", "-M", "-z", "--relative"],
    signal,
  );
  files.push(...parseNameStatus(staged.stdout, "staged"));
  const unstaged = await git(dir, ["diff", "--name-status", "-M", "-z", "--relative"], signal);
  files.push(...parseNameStatus(unstaged.stdout, "unstaged"));
  for (const file of untracked)
    files.push({ path: file, previousPath: null, status: "added", stage: "untracked" });

  const commits: GitFacts["commits"] = [];
  if (baseline.sha !== head) {
    const log = await git(
      dir,
      [
        "log",
        "--format=%x1e%H%x1f%an%x1f%aI%x1f%s%x1f%(trailers:key=Co-authored-by,valueonly,separator=%x2C)",
        "--name-only",
        "--relative",
        `${baseline.sha}..HEAD`,
      ],
      signal,
    );
    for (const chunk of log.stdout.split("\x1e").filter((c) => c.trim())) {
      const [header = "", ...rest] = chunk.split("\n");
      const [sha = "", author = "", date = "", subject = "", trailers = ""] = header.split("\x1f");
      commits.push({
        sha,
        author,
        date,
        subject,
        agentTrailer: agentTrailer(trailers),
        files: rest.filter(Boolean),
      });
    }
  }

  const tree = await git(dir, ["ls-tree", "-r", "--name-only", baseline.sha], signal);
  const baselineFiles: GitFacts["baselineFiles"] = [];
  for (const file of tree.stdout.split("\n").filter(Boolean)) {
    if (!(file.startsWith(KNOWLEDGE_DIR) && file.endsWith(".md")) && !isManifest(file)) continue;
    const shown = await git(dir, ["show", `${baseline.sha}:./${file}`], signal);
    if (shown.ok) baselineFiles.push({ path: file, content: shown.stdout });
  }

  return {
    head,
    branch,
    stateId,
    comparison: {
      status: "available",
      reason: null,
      defaultBranch: defaultBranch.name,
      defaultBranchSource: defaultBranch.source,
      onDefaultBranch,
      baseline,
    },
    commits,
    files: files.filter((f) => !f.path.startsWith(`${KNOWLEDGE_DIR}.generated/`)),
    baselineFiles,
  };
}
