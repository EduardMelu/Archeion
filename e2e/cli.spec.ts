// The installed-command behaviours that need a real process: exit codes and file preservation.
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { CLI } from "./global-setup.ts";

const run = (...args: string[]) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
const scratch = mkdtempSync(path.join(tmpdir(), "archeion-cli-"));
let counter = 0;
const fresh = () => {
  const dir = path.join(scratch, `case-${counter++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

test.afterAll(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 3 }));

const validTrail = {
  version: 1,
  id: "a-trail",
  title: "A trail",
  question: "Why?",
  finding: null,
  author: null,
  snapshot: { graphDigest: null, repos: [] },
  steps: [],
};

test.describe("init", () => {
  test("creates a starter folder that builds, and ignores generated output", () => {
    const dir = fresh();
    expect(run("init", "-C", dir).status).toBe(0);
    expect(readFileSync(path.join(dir, ".gitignore"), "utf8")).toContain(".archeion/.generated/");
    const built = run("build", "-C", dir);
    expect(built.status).toBe(0);
    expect(existsSync(path.join(dir, ".archeion/.generated/graph.json"))).toBe(true);
    expect(existsSync(path.join(dir, ".archeion/.generated/build-info.json"))).toBe(true);
  });

  test("preserves existing knowledge and an existing ignore file", () => {
    const dir = fresh();
    mkdirSync(path.join(dir, ".archeion"));
    writeFileSync(path.join(dir, ".archeion/system.md"), "---\nid: mine\n---\n# Mine\n");
    writeFileSync(path.join(dir, ".gitignore"), "node_modules");
    const result = run("init", "-C", dir);
    expect(result.stdout).toContain("nothing was changed");
    expect(readFileSync(path.join(dir, ".archeion/system.md"), "utf8")).toContain("id: mine");
    expect(readFileSync(path.join(dir, ".gitignore"), "utf8")).toBe(
      "node_modules\n.archeion/.generated/\n",
    );
  });
});

test.describe("check and build", () => {
  test("check exits 1 on an error, says where, and writes nothing", () => {
    const dir = fresh();
    mkdirSync(path.join(dir, ".archeion"));
    writeFileSync(
      path.join(dir, ".archeion/system.md"),
      "---\nid: broken\nname: Broken\n---\n# Broken\n\n```archeion\nparts:\n  a:\n    kind: microservice\n```\n",
    );
    const result = run("check", "-C", dir);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(".archeion/system.md:9 error invalid-part");
    expect(existsSync(path.join(dir, ".archeion/.generated"))).toBe(false);

    const json = run("check", "-C", dir, "--json");
    expect(JSON.parse(json.stdout)[0].code).toBe("invalid-part");
  });

  test("a directory with no knowledge fails clearly and records the failure", () => {
    const dir = fresh();
    const result = run("build", "-C", dir);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("archeion init");
    const info = JSON.parse(
      readFileSync(path.join(dir, ".archeion/.generated/build-info.json"), "utf8"),
    );
    expect(info.status).toBe("failed");
    expect(info.graphDigest).toBeNull();
  });

  test("an unchanged rebuild writes byte-identical graph content", () => {
    const dir = path.join(fresh(), "platform");
    cpSync(new URL("../fixtures/platform/", import.meta.url), dir, { recursive: true });
    run("build", "-C", dir);
    const first = readFileSync(path.join(dir, ".archeion/.generated/graph.json"));
    const firstInfo = JSON.parse(
      readFileSync(path.join(dir, ".archeion/.generated/build-info.json"), "utf8"),
    );
    run("build", "-C", dir);
    const second = readFileSync(path.join(dir, ".archeion/.generated/graph.json"));
    const secondInfo = JSON.parse(
      readFileSync(path.join(dir, ".archeion/.generated/build-info.json"), "utf8"),
    );
    expect(second.equals(first)).toBe(true);
    expect(secondInfo.graphDigest).toBe(firstInfo.graphDigest);
  });

  test("a missing repository is an actionable error, not a crash", () => {
    const dir = path.join(fresh(), "platform");
    cpSync(new URL("../fixtures/platform/", import.meta.url), dir, { recursive: true });
    rmSync(path.join(dir, "shop-web"), { recursive: true });
    const result = run("build", "-C", dir);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Repository "shop-web" was not found');
    expect(existsSync(path.join(dir, ".archeion/.generated/graph.json"))).toBe(true);
  });
});

test.describe("import-trail", () => {
  const setup = () => {
    const dir = fresh();
    run("init", "-C", dir);
    const file = path.join(dir, "export.json");
    return { dir, file };
  };

  test("writes a small Markdown trail for review, and a later build carries it", () => {
    const { dir, file } = setup();
    writeFileSync(file, JSON.stringify(validTrail));
    const result = run("import-trail", file, "-C", dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Review it");
    expect(run("build", "-C", dir).status).toBe(0);
    const graph = JSON.parse(
      readFileSync(path.join(dir, ".archeion/.generated/graph.json"), "utf8"),
    );
    expect(graph.trails[0].id).toBe("a-trail");
  });

  test("refuses an incompatible export", () => {
    const { dir, file } = setup();
    writeFileSync(file, JSON.stringify({ ...validTrail, version: 7 }));
    const result = run("import-trail", file, "-C", dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not a compatible trail export");
  });

  test("refuses an id that would write outside the trails folder", () => {
    const { dir, file } = setup();
    writeFileSync(file, JSON.stringify({ ...validTrail, id: "../../escape" }));
    expect(run("import-trail", file, "-C", dir).status).toBe(1);
    expect(existsSync(path.join(dir, "escape.md"))).toBe(false);
  });

  test("leaves an existing destination unchanged", () => {
    const { dir, file } = setup();
    writeFileSync(file, JSON.stringify(validTrail));
    run("import-trail", file, "-C", dir);
    const destination = path.join(dir, ".archeion/trails/a-trail.md");
    writeFileSync(destination, "An owner's edit.\n");
    const result = run("import-trail", file, "-C", dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("left unchanged");
    expect(readFileSync(destination, "utf8")).toBe("An owner's edit.\n");
  });
});

test("this repository's own knowledge is valid, with its own flow fully resolved", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = run("check", "-C", root, "--json");
  expect(result.status).toBe(0);
  const codes = JSON.parse(result.stdout).map((d: { code: string }) => d.code);
  expect(codes).not.toContain("flow-step-without-link");
  expect(codes).not.toContain("unresolved-ref");
  expect(codes).not.toContain("unknown-connection");
});

test("the version prints without a workspace", () => {
  const output = execFileSync(process.execPath, [CLI, "--version"], { encoding: "utf8" });
  expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
});
