// R1-R3 against real temporary Git repositories.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Graph } from "@archeion/core";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { collectGitFacts } from "../src/git";
import { runBuild } from "../src/pipeline";

const fixture = new URL("../../../fixtures/platform/shop-web/", import.meta.url);
const scratch = mkdtempSync(path.join(tmpdir(), "archeion-radar-"));
let repo: string;
let counter = 0;

function git(...args: string[]) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function write(file: string, content: string) {
  writeFileSync(path.join(repo, file), content);
}

function commit(message: string, ...trailers: string[]) {
  git("add", "-A");
  git("commit", "-q", "-m", [message, ...trailers].join("\n\n"));
}

const build = async (base?: string): Promise<Graph> =>
  (await runBuild({ root: repo, ...(base ? { base } : {}) })).graph;
const files = (graph: Graph) => graph.comparison.files.map((f) => `${f.stage}:${f.path}`).sort();

beforeEach(() => {
  repo = path.join(scratch, `shop-${counter++}`);
  cpSync(fixture, repo, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "trunk", repo]);
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  commit("Initial");
});

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("R1: branch commits and local edits", () => {
  it("includes both, labels local work, and shows the resolved baseline", async () => {
    const start = git("rev-parse", "HEAD");
    git("checkout", "-q", "-b", "feature");
    write("src/checkout/CheckoutPage.tsx", "export const committed = 1;\n");
    commit("Rework checkout");
    write("src/catalog/catalogApi.ts", "export const unstaged = 1;\n");
    write("src/account/accountApi.ts", "export const staged = 1;\n");
    git("add", "src/account/accountApi.ts");
    write("src/account/newFile.ts", "export const untracked = 1;\n");

    const graph = await build();
    const row = graph.comparison.repos[0];
    expect(row).toMatchObject({
      status: "available",
      defaultBranch: "trunk",
      onDefaultBranch: false,
    });
    expect(row?.baseline).toEqual({ ref: "trunk", sha: start, kind: "merge-base" });
    expect(files(graph)).toEqual([
      "committed:src/checkout/CheckoutPage.tsx",
      "staged:src/account/accountApi.ts",
      "unstaged:src/catalog/catalogApi.ts",
      "untracked:src/account/newFile.ts",
    ]);

    const part = (id: string) => graph.comparison.parts.find((p) => p.part === id);
    expect(part("checkout")).toMatchObject({ status: "changed", committed: true, local: false });
    expect(part("catalog-browser")).toMatchObject({ committed: false, local: true });
    expect(part("account-pages")).toMatchObject({ committed: false, local: true });
    expect(graph.comparison.commits.map((c) => c.subject)).toEqual(["Rework checkout"]);
  });

  it("supports another reference", async () => {
    write("src/checkout/CheckoutPage.tsx", "export const one = 1;\n");
    commit("One");
    const earlier = git("rev-parse", "HEAD~1");
    const graph = await build(earlier);
    expect(graph.comparison.repos[0]?.baseline).toEqual({
      ref: earlier,
      sha: earlier,
      kind: "explicit",
    });
    expect(files(graph)).toEqual(["committed:src/checkout/CheckoutPage.tsx"]);
  });

  it("reports a missing reference instead of an empty comparison", async () => {
    const graph = await build("no-such-ref");
    expect(graph.comparison.repos[0]?.status).toBe("unavailable");
    expect(graph.comparison.repos[0]?.reason).toContain("no-such-ref");
    expect(graph.diagnostics.map((d) => d.code)).toContain("comparison-unavailable");
  });

  it("refuses a reference that would read as a Git option", async () => {
    const facts = await collectGitFacts(repo, { base: "--output=pwned" });
    expect(facts?.comparison.status).toBe("unavailable");
  });
});

describe("R2: working directly on the default branch", () => {
  it("shows local edits by default, and committed work with an earlier reference", async () => {
    write("src/checkout/CheckoutPage.tsx", "export const committed = 1;\n");
    commit("Direct commit");
    write("src/catalog/catalogApi.ts", "export const local = 1;\n");

    const byDefault = await build();
    expect(byDefault.comparison.repos[0]).toMatchObject({ onDefaultBranch: true });
    expect(byDefault.comparison.repos[0]?.baseline?.kind).toBe("head");
    expect(files(byDefault)).toEqual(["unstaged:src/catalog/catalogApi.ts"]);

    const earlier = await build("HEAD~1");
    expect(files(earlier)).toEqual([
      "committed:src/checkout/CheckoutPage.tsx",
      "unstaged:src/catalog/catalogApi.ts",
    ]);
  });
});

describe("R3 inputs and the motivating examples", () => {
  it("makes a styling-library swap visible before commit", async () => {
    const manifest = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8"));
    delete manifest.dependencies["styled-components"];
    manifest.dependencies["@emotion/react"] = "11.13.0";
    write("package.json", JSON.stringify(manifest, null, 2));

    const graph = await build();
    const changes = graph.comparison.dependencies.map((d) => [
      d.name,
      d.from,
      d.to,
      d.local,
      d.parts,
    ]);
    expect(changes).toEqual([
      ["@emotion/react", null, "11.13.0", true, ["storefront"]],
      ["styled-components", "6.1.0", null, true, ["storefront"]],
    ]);
    expect(graph.comparison.parts.find((p) => p.part === "storefront")?.local).toBe(true);
  });

  it("finds a new module declared in knowledge before commit", async () => {
    const file = ".archeion/parts/storefront.md";
    const content = readFileSync(path.join(repo, file), "utf8");
    write(
      file,
      content.replace(
        "links:",
        "  wishlist:\n    kind: module\n    does: Saves products for later\nlinks:",
      ),
    );
    const graph = await build();
    expect(graph.comparison.parts.find((p) => p.part === "wishlist")).toMatchObject({
      status: "added",
      local: true,
    });
  });

  it("keeps a removed part inspectable", async () => {
    const file = ".archeion/parts/storefront.md";
    const content = readFileSync(path.join(repo, file), "utf8");
    write(
      file,
      content
        .replace(/ {2}account-pages:[\s\S]*?code: \["src\/account\/\*\*"\]\n/, "")
        .replace(/ {2}- account-pages calls.*\n/, ""),
    );
    const graph = await build();
    expect(graph.parts.some((p) => p.id === "account-pages")).toBe(false);
    expect(graph.comparison.removedParts[0]).toMatchObject({
      id: "account-pages",
      name: "Account Pages",
      repo: "shop-web",
    });
    expect(graph.comparison.parts.find((p) => p.part === "account-pages")?.status).toBe("removed");
  });

  it("records renames and deletions", async () => {
    git("checkout", "-q", "-b", "feature");
    renameSync(
      path.join(repo, "src/catalog/catalogApi.ts"),
      path.join(repo, "src/catalog/products.ts"),
    );
    rmSync(path.join(repo, "src/account/accountApi.ts"));
    commit("Rename and delete");
    const graph = await build();
    const change = (p: string) => graph.comparison.files.find((f) => f.path === p);
    expect(change("src/catalog/products.ts")).toMatchObject({
      status: "renamed",
      previousPath: "src/catalog/catalogApi.ts",
      parts: ["catalog-browser"],
    });
    expect(change("src/account/accountApi.ts")).toMatchObject({
      status: "deleted",
      parts: ["account-pages"],
    });
  });

  it("keeps changes no part covers visible as unmapped", async () => {
    write("tools.ts", "export const stray = 1;\n");
    const graph = await build();
    expect(graph.comparison.files.find((f) => f.path === "tools.ts")?.parts).toEqual([]);
  });

  it("reports an agent trailer as a hint on the commit, not as authorship", async () => {
    git("checkout", "-q", "-b", "feature");
    write("src/checkout/CheckoutPage.tsx", "export const byAgent = 1;\n");
    commit("Agent change", "Co-Authored-By: Claude Opus <noreply@example.invalid>");
    const graph = await build();
    expect(graph.comparison.commits[0]).toMatchObject({
      author: "Fixture",
      agentTrailer: "Claude Opus",
    });
    expect(graph.comparison.parts.find((p) => p.part === "checkout")?.agentTrailer).toBe(
      "Claude Opus",
    );
  });
});

describe("a comparison across repositories", () => {
  it("does not flag a part just because another repository contributes to it", async () => {
    const platform = path.join(scratch, `platform-${counter++}`);
    cpSync(new URL("../../../fixtures/platform/", import.meta.url), platform, { recursive: true });
    for (const name of ["shop-web", "orders-api", "fulfilment-worker"]) {
      const dir = path.join(platform, name);
      execFileSync("git", ["init", "-q", "-b", "main", dir]);
      execFileSync("git", ["-C", dir, "config", "core.autocrlf", "false"]);
      execFileSync("git", ["-C", dir, "add", "-A"]);
      execFileSync("git", [
        "-C",
        dir,
        "-c",
        "user.email=f@example.invalid",
        "-c",
        "user.name=F",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-q",
        "-m",
        "Initial",
      ]);
    }
    const { graph } = await runBuild({ root: platform });
    expect(graph.parts.find((p) => p.id === "documents-store")?.reuse).toHaveLength(1);
    expect(graph.comparison.parts).toEqual([]);
  });
});

describe("content-derived working state", () => {
  it("distinguishes two different local edits on the same commit", async () => {
    write("src/checkout/CheckoutPage.tsx", "export const a = 1;\n");
    const first = await build();
    write("src/checkout/CheckoutPage.tsx", "export const a = 2;\n");
    const second = await build();
    expect(first.repos[0]?.head).toBe(second.repos[0]?.head);
    expect(first.repos[0]?.stateId).not.toBe(second.repos[0]?.stateId);

    const fingerprint = (g: Graph, id: string) => g.parts.find((p) => p.id === id)?.fingerprint;
    expect(fingerprint(first, "checkout")).not.toBe(fingerprint(second, "checkout"));
    expect(fingerprint(first, "storefront")).not.toBe(fingerprint(second, "storefront"));
    expect(fingerprint(first, "catalog-browser")).toBe(fingerprint(second, "catalog-browser"));
  });

  it("resolves the same id for the same content", async () => {
    write("src/checkout/CheckoutPage.tsx", "export const a = 1;\n");
    const first = await build();
    const second = await build();
    expect(first.repos[0]?.stateId).toBe(second.repos[0]?.stateId);
  });

  it("marks a repository with no commits as unavailable", async () => {
    const empty = path.join(scratch, `empty-${counter++}`);
    cpSync(fixture, empty, { recursive: true });
    execFileSync("git", ["init", "-q", "-b", "trunk", empty]);
    const facts = await collectGitFacts(empty);
    expect(facts?.comparison).toMatchObject({ status: "unavailable" });
    expect(facts?.comparison.reason).toContain("no commits");
  });

  it("returns no Git facts outside a work tree", async () => {
    const plain = mkdtempSync(path.join(tmpdir(), "archeion-plain-"));
    expect(await collectGitFacts(plain)).toBeNull();
    rmSync(plain, { recursive: true, force: true });
  });
});
