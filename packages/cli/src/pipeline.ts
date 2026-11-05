// Disk and process I/O around the core: load inputs, build, and write artifacts atomically.
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  type BuildInfo,
  buildGraph,
  type Diagnostic,
  GRAPH_VERSION,
  type Graph,
  KNOWLEDGE_DIR,
  type LoadedParsers,
  loadParsers,
  type RepoInput,
  type SourceFile,
  serializeGraph,
  sha256,
  workspaceSchema,
} from "@archeion/core";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import pkg from "../package.json" with { type: "json" };
import { collectGitFacts, git } from "./git";

export const TOOL_VERSION = pkg.version;
export const GENERATED_DIR = `${KNOWLEDGE_DIR}.generated`;

const TEXT_FILE = /\.(cs|csproj|ts|tsx|json|ya?ml|md)$/i;
const MAX_TEXT_BYTES = 1024 * 1024;
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "bin",
  "obj",
  "dist",
  "build",
  "out",
  "coverage",
  ".generated",
  ".vite",
]);

export class WorkspaceError extends Error {}

async function listFiles(dir: string): Promise<string[]> {
  const tracked = await git(dir, ["ls-files", "-co", "--exclude-standard", "-z"]);
  if (tracked.ok) return tracked.stdout.split("\0").filter(Boolean);
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(dir, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"),
    )
    .filter(
      (file) =>
        !file
          .split("/")
          .slice(0, -1)
          .some((segment) => SKIP_DIRS.has(segment)),
    );
}

async function readFiles(dir: string, only?: (file: string) => boolean): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  for (const file of (await listFiles(dir)).sort()) {
    if (file.startsWith(`${GENERATED_DIR}/`) || (only && !only(file))) continue;
    const bytes = await readFile(path.join(dir, file)).catch(() => null);
    if (!bytes) continue; // Tracked but deleted locally; Git facts report the removal.
    const isText = TEXT_FILE.test(file) && bytes.byteLength <= MAX_TEXT_BYTES;
    files.push({
      path: file,
      hash: sha256(bytes),
      content: isText ? bytes.toString("utf8") : null,
    });
  }
  return files;
}

async function loadAssets(): Promise<LoadedParsers> {
  const packaged = new URL("./grammars/", import.meta.url);
  const grammars = existsSync(packaged)
    ? packaged
    : new URL("../../core/grammars/", import.meta.url);
  const runtime = createRequire(import.meta.url).resolve("web-tree-sitter");
  const read = (name: string) => readFile(new URL(name, grammars));
  return loadParsers(
    {
      csharp: await read("tree-sitter-c_sharp.wasm"),
      typescript: await read("tree-sitter-typescript.wasm"),
      tsx: await read("tree-sitter-tsx.wasm"),
    },
    await readFile(path.join(path.dirname(runtime), "web-tree-sitter.wasm")),
  );
}

let parsers: Promise<LoadedParsers> | undefined;

export interface BuildOptions {
  root: string;
  /** Explicit baseline per repository id. */
  bases?: Record<string, string>;
  /** Baseline for every repository, for single-repository workspaces. */
  base?: string;
}

export interface BuildResult {
  graph: Graph;
  text: string;
  digest: string;
  errors: number;
  repoDirs: string[];
}

async function systemFrontmatter(root: string): Promise<{ id?: string; name?: string }> {
  const content = await readFile(path.join(root, KNOWLEDGE_DIR, "system.md"), "utf8").catch(
    () => null,
  );
  if (content === null)
    throw new WorkspaceError(
      `No ${KNOWLEDGE_DIR}system.md or workspace.yaml in ${root}. Run \`archeion init\` first.`,
    );
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  return match ? (parseYaml(match[1] as string) ?? {}) : {};
}

export async function runBuild(options: BuildOptions): Promise<BuildResult> {
  const root = path.resolve(options.root);
  const workspaceFile = path.join(root, KNOWLEDGE_DIR, "workspace.yaml");
  const repos: RepoInput[] = [];
  const diagnostics: Diagnostic[] = [];
  const repoDirs: string[] = [];
  let workspace: { id: string; name: string };

  const baseFor = (id: string) => options.bases?.[id] ?? options.base;

  if (existsSync(workspaceFile)) {
    const parsed = workspaceSchema.safeParse(parseYaml(await readFile(workspaceFile, "utf8")));
    if (!parsed.success) {
      throw new WorkspaceError(
        `Invalid ${KNOWLEDGE_DIR}workspace.yaml:\n${z.prettifyError(parsed.error)}`,
      );
    }
    workspace = { id: parsed.data.id, name: parsed.data.name };
    const rootKnowledge = await readFiles(
      root,
      (file) => file.startsWith(KNOWLEDGE_DIR) && file.endsWith(".md"),
    );
    if (rootKnowledge.length > 0) {
      repos.push({
        id: workspace.id,
        name: workspace.name,
        files: rootKnowledge,
        git: null,
        knowledgeOnly: true,
      });
      repoDirs.push(path.join(root, KNOWLEDGE_DIR));
    }
    for (const repo of parsed.data.repos) {
      const dir = path.resolve(root, repo.path);
      if (!existsSync(dir)) {
        diagnostics.push({
          severity: "error",
          code: "repo-missing",
          message: `Repository "${repo.id}" was not found at ${repo.path}. Its parts are absent from this map.`,
          repo: repo.id,
          file: `${KNOWLEDGE_DIR}workspace.yaml`,
          line: null,
          part: null,
        });
        continue;
      }
      const base = baseFor(repo.id) ?? repo.base;
      repos.push({
        id: repo.id,
        files: await readFiles(dir),
        git: await collectGitFacts(dir, {
          ...(repo.defaultBranch ? { defaultBranch: repo.defaultBranch } : {}),
          ...(base ? { base } : {}),
        }),
      });
      repoDirs.push(dir);
    }
  } else {
    const front = await systemFrontmatter(root);
    const id = front.id ?? path.basename(root);
    workspace = { id, name: front.name ?? id };
    const base = baseFor(id);
    repos.push({
      id,
      name: workspace.name,
      files: await readFiles(root),
      git: await collectGitFacts(root, base ? { base } : {}),
    });
    repoDirs.push(root);
  }

  parsers ??= loadAssets();
  const graph = await buildGraph({ workspace, repos, parsers: await parsers, diagnostics });
  const text = serializeGraph(graph);
  return {
    graph,
    text,
    digest: sha256(text),
    errors: graph.diagnostics.filter((d) => d.severity === "error").length,
    repoDirs,
  };
}

async function writeAtomic(file: string, content: string) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, file);
}

export function artifactsDir(root: string): string {
  return path.join(path.resolve(root), GENERATED_DIR);
}

export interface ArtifactFlags {
  watch?: boolean;
  canRebuild?: boolean;
}

function buildInfo(digest: string | null, failure: string | null, flags: ArtifactFlags): BuildInfo {
  return {
    version: GRAPH_VERSION,
    toolVersion: TOOL_VERSION,
    builtAt: new Date().toISOString(),
    graphDigest: digest,
    status: failure ? "failed" : "ok",
    failure,
    watch: flags.watch ?? false,
    canRebuild: flags.canRebuild ?? false,
  };
}

/** The graph lands first, so metadata never names a digest that is not on disk yet. */
export async function writeArtifacts(
  outDir: string,
  result: BuildResult,
  flags: ArtifactFlags = {},
) {
  await mkdir(outDir, { recursive: true });
  await writeAtomic(path.join(outDir, "graph.json"), result.text);
  await writeAtomic(
    path.join(outDir, "build-info.json"),
    `${JSON.stringify(buildInfo(result.digest, null, flags), null, 2)}\n`,
  );
}

/** A failed rebuild stays visible while the previous usable graph remains on disk. */
export async function writeFailure(outDir: string, failure: string, flags: ArtifactFlags = {}) {
  await mkdir(outDir, { recursive: true });
  const previous = await readFile(path.join(outDir, "graph.json")).catch(() => null);
  await writeAtomic(
    path.join(outDir, "build-info.json"),
    `${JSON.stringify(buildInfo(previous ? sha256(previous) : null, failure, flags), null, 2)}\n`,
  );
}
