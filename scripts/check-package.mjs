// Installs the packed CLI outside this checkout and proves it works: no workspace symlinks, no
// private packages, every WASM/font/worker asset present, and no .NET anywhere on the path.
// Nothing is published. Requires `npm run build` first.
import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const CLI_PACKAGE = path.join(REPO, "packages/cli");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const scratch = mkdtempSync(path.join(tmpdir(), "archeion-package-"));

function step(name, check) {
  const result = check();
  console.log(`ok - ${name}${result ? `: ${result}` : ""}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const runNpm = (args, cwd) =>
  execFileSync(npm, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

try {
  const packed = JSON.parse(
    runNpm(["pack", "--json", "--pack-destination", scratch], CLI_PACKAGE),
  )[0];
  const tarball = path.join(scratch, packed.filename);
  const files = packed.files.map((f) => f.path.replaceAll("\\", "/"));

  step("the package contains the viewer, fonts, worker, and parser assets", () => {
    const needed = [
      /^dist\/cli\.js$/,
      /^dist\/viewer\/index\.html$/,
      /^dist\/viewer\/assets\/elk\.worker-.*\.js$/,
      /^dist\/viewer\/assets\/ibm-plex-sans-latin-500-normal.*\.woff$/,
      /^dist\/viewer\/assets\/chakra-petch-latin-600-normal.*\.woff2?$/,
      /^dist\/grammars\/tree-sitter-c_sharp\.wasm$/,
      /^dist\/grammars\/tree-sitter-typescript\.wasm$/,
      /^dist\/grammars\/tree-sitter-tsx\.wasm$/,
      /^dist\/grammars\/licenses\/tree-sitter-c-sharp@0\.23\.5\.LICENSE$/,
      /^dist\/grammars\/licenses\/tree-sitter-typescript@0\.23\.2\.LICENSE$/,
      /^dist\/viewer\/THIRD_PARTY_LICENSES\.txt$/,
      /^dist\/viewer\/THIRD_PARTY_NOTICES\.md$/,
      /^dist\/THIRD_PARTY_NOTICES\.md$/,
      /^dist\/LICENSE$/,
      /^dist\/README\.md$/,
      /^dist\/docs\/AGENT-ONBOARDING\.md$/,
      /^dist\/docs\/KNOWLEDGE-FORMAT\.md$/,
      /^dist\/docs\/EXTRACTION-COVERAGE\.md$/,
    ];
    for (const pattern of needed)
      assert(
        files.some((f) => pattern.test(f)),
        `Missing from the package: ${pattern}`,
      );
    assert(
      !files.some((f) => f.startsWith("src/") || f.includes("node_modules")),
      "Sources or node_modules leaked into the package.",
    );
    return `${files.length} files, ${Math.round(packed.unpackedSize / 1024 / 1024)} MB unpacked`;
  });

  const install = path.join(scratch, "install");
  mkdirSync(install);
  writeFileSync(path.join(install, "package.json"), '{"name":"install-check","private":true}');
  runNpm(["install", tarball, "--no-audit", "--no-fund"], install);
  const installed = path.join(install, "node_modules/archeion");
  const cli = path.join(installed, "dist/cli.js");

  step("third-party notices and contributor documentation survive packing", () => {
    const notices = readFileSync(
      path.join(installed, "dist/viewer/THIRD_PARTY_LICENSES.txt"),
      "utf8",
    );
    for (const text of [
      "@fontsource/chakra-petch@",
      "@fontsource/ibm-plex-sans@",
      "@fontsource/ibm-plex-mono@",
      "SIL OPEN FONT LICENSE",
      "The Chakra Petch Project Authors",
      "IBM Corp.",
      "elkjs@",
      "Eclipse Public License",
      "Copyright 2020 Google LLC",
      "Apache License",
      "EMF-GWT",
      "woff2otf.js",
      "react@",
      "Permission is hereby granted",
    ])
      assert(notices.includes(text), `Missing bundled attribution: ${text}`);
    for (const name of ["tree-sitter-c-sharp@0.23.5", "tree-sitter-typescript@0.23.2"]) {
      const license = readFileSync(
        path.join(installed, `dist/grammars/licenses/${name}.LICENSE`),
        "utf8",
      );
      assert(
        license.includes("Copyright") && license.includes("Permission is hereby granted"),
        `Incomplete parser license: ${name}`,
      );
    }
    const guide = readFileSync(path.join(installed, "dist/docs/AGENT-ONBOARDING.md"), "utf8");
    assert(guide.includes("archeion"), "The agent onboarding guide is empty or unrelated.");
    const readme = readFileSync(path.join(installed, "dist/README.md"), "utf8");
    assert(
      readme.includes("raw.githubusercontent.com"),
      "The packaged README artwork has no upstream source.",
    );
    for (const [, target] of readme.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(target)) continue;
      assert(
        existsSync(path.join(installed, "dist", target.split("#")[0])),
        `Broken packaged README link: ${target}`,
      );
    }
    assert(
      readFileSync(path.join(installed, "dist/LICENSE"), "utf8").includes("MIT License"),
      "The project license is missing.",
    );
  });

  step("the install is a real copy with no private dependencies", () => {
    assert(!lstatSync(installed).isSymbolicLink(), "The installed package is a symlink.");
    const manifest = JSON.parse(readFileSync(path.join(installed, "package.json"), "utf8"));
    assert(
      !Object.keys(manifest.dependencies).some((name) => name.startsWith("@archeion/")),
      "A private workspace package is a runtime dependency.",
    );
    const bundle = readFileSync(cli, "utf8");
    assert(
      !bundle.includes('from "@archeion/'),
      "The bundle still imports a private workspace package.",
    );
    assert(
      !bundle.includes(REPO.replaceAll("\\", "/")),
      "The bundle embeds a path from this checkout.",
    );
  });

  // Only node and git on the path, so a .NET runtime cannot be reached even by accident.
  const gitDir = path.dirname(
    execFileSync(process.platform === "win32" ? "where" : "which", ["git"], {
      encoding: "utf8",
    }).split(/\r?\n/)[0],
  );
  const env = {
    PATH: [path.dirname(process.execPath), gitDir].join(path.delimiter),
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    USERPROFILE: process.env.USERPROFILE,
    HOME: process.env.HOME,
  };

  const workspace = path.join(scratch, "platform");
  cpSync(path.join(REPO, "fixtures/platform"), workspace, { recursive: true });

  step("it scans C#, TS, and TSX with no .NET on the path", () => {
    execFileSync(process.execPath, [cli, "build", "-C", workspace], { env, stdio: "pipe" });
    const graph = JSON.parse(
      readFileSync(path.join(workspace, ".archeion/.generated/graph.json"), "utf8"),
    );
    const facts = (repo, extractor) =>
      graph.coverage.find((c) => c.repo === repo && c.extractor === extractor)?.facts ?? 0;
    assert(facts("orders-api", "csharp") > 0, "No C# facts: the C# grammar did not load.");
    assert(facts("shop-web", "typescript") >= 3, "Too few TS/TSX facts: a grammar did not load.");
    assert(facts("orders-api", "openapi") > 0, "No OpenAPI facts.");
    assert(facts("orders-api", "arm") > 0, "No ARM facts.");
    return `${graph.parts.length} parts, ${graph.connections.length} connections`;
  });

  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cli, "view", "--no-open", "--no-build", "--port", "4399", "-C", workspace],
      { env, stdio: ["ignore", "pipe", "inherit"] },
    );
    child.on("error", reject);
    child.stdout.on("data", async (chunk) => {
      if (!chunk.toString().includes("Archeion is at")) return;
      try {
        const base = "http://127.0.0.1:4399/";
        const html = await (await fetch(base)).text();
        assert(html.includes('id="root"'), "index.html did not load.");
        const script = /src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
        assert(script, "index.html names no script.");
        const asset = await fetch(base + script);
        assert(
          asset.ok && asset.headers.get("cache-control")?.includes("immutable"),
          "Hashed assets must be immutable.",
        );
        const graph = await fetch(`${base}data/graph.json`);
        assert(
          graph.ok && graph.headers.get("cache-control") === "no-store",
          "Generated data must not be cached.",
        );
        const worker = files.find((f) => /elk\.worker-.*\.js$/.test(f)).replace("dist/viewer/", "");
        assert((await fetch(base + worker)).ok, "The layout worker is not served.");
        const font = files
          .find((f) => /plex-sans-latin-500-normal.*\.woff$/.test(f))
          .replace("dist/viewer/", "");
        assert((await fetch(base + font)).ok, "Fonts are not served.");
        const refused = await fetch(`${base}../package.json`);
        assert(
          !(await refused.text()).includes('"name": "archeion"'),
          "A file outside the viewer was served.",
        );
        console.log("ok - the installed command serves the viewer, data, worker, and fonts");
        child.kill();
        resolve();
      } catch (error) {
        child.kill();
        reject(error);
      }
    });
  });

  console.log("The package works outside the checkout. Nothing was published.");
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
}
