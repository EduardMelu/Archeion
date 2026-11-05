#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type Diagnostic,
  parseError,
  renderTrail,
  trailFileName,
  trailSchema,
} from "@archeion/core";
import { Command } from "commander";
import {
  artifactsDir,
  GENERATED_DIR,
  runBuild,
  TOOL_VERSION,
  WorkspaceError,
  writeArtifacts,
  writeFailure,
} from "./pipeline";
import { startServer } from "./serve";

function printDiagnostics(diagnostics: Diagnostic[]) {
  for (const d of diagnostics) {
    const where = d.file
      ? `${d.repo ? `${d.repo}:` : ""}${d.file}${d.line ? `:${d.line}` : ""}`
      : (d.repo ?? "workspace");
    console.log(`${where} ${d.severity} ${d.code} ${d.message}`);
  }
}

function parseBases(values: string[]): { base?: string; bases: Record<string, string> } {
  const bases: Record<string, string> = {};
  let base: string | undefined;
  for (const value of values) {
    const index = value.indexOf("=");
    if (index > 0) bases[value.slice(0, index)] = value.slice(index + 1);
    else base = value;
  }
  return base ? { base, bases } : { bases };
}

function fail(error: unknown): never {
  console.error(error instanceof WorkspaceError ? error.message : error);
  process.exit(2);
}

const program = new Command();
program
  .name("archeion")
  .description(
    "Generate and explore an architecture map from reviewed knowledge and code evidence.",
  )
  .version(TOOL_VERSION);

program
  .command("init")
  .description("Create a starter knowledge folder. Existing files are preserved.")
  .option("-C, --dir <dir>", "repository directory", ".")
  .action(async (options: { dir: string }) => {
    const root = path.resolve(options.dir);
    const system = path.join(root, ".archeion", "system.md");
    if (existsSync(system)) {
      console.log(`${system} already exists; nothing was changed.`);
    } else {
      await mkdir(path.dirname(system), { recursive: true });
      const id = path
        .basename(root)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-");
      await writeFile(
        system,
        `---\narcheion: 1\nid: ${id}\nname: ${path.basename(root)}\n---\n# ${path.basename(root)}\n\nOne line saying what this repository is for.\n\n## Map\n\n\`\`\`archeion\nparts:\n  ${id}:\n    kind: service\n    does: What this part is responsible for, in one line.\n    code: ["src/**"]\nlinks: []\n\`\`\`\n`,
      );
      console.log(`Created ${system}. Review it with the code it describes before committing.`);
    }
    const ignoreFile = path.join(root, ".gitignore");
    const ignore = await readFile(ignoreFile, "utf8").catch(() => "");
    if (!ignore.includes(GENERATED_DIR)) {
      await appendFile(
        ignoreFile,
        `${ignore && !ignore.endsWith("\n") ? "\n" : ""}${GENERATED_DIR}/\n`,
      );
    }
  });

program
  .command("check")
  .description("Validate knowledge and evidence without writing artifacts. Exits 1 on any error.")
  .option("-C, --dir <dir>", "workspace directory", ".")
  .option("--json", "print diagnostics as JSON")
  .action(async (options: { dir: string; json?: boolean }) => {
    const result = await runBuild({ root: options.dir }).catch(fail);
    if (options.json) console.log(JSON.stringify(result.graph.diagnostics, null, 2));
    else printDiagnostics(result.graph.diagnostics);
    process.exitCode = result.errors > 0 ? 1 : 0;
  });

program
  .command("build")
  .description(
    "Write graph.json and build-info.json. Exits 1 on any error; a usable graph is still written.",
  )
  .option("-C, --dir <dir>", "workspace directory", ".")
  .option("-o, --out <dir>", "output directory")
  .option("--base <ref...>", "comparison baseline: <ref>, or <repo>=<ref> per repository", [])
  .action(async (options: { dir: string; out?: string; base: string[] }) => {
    const outDir = options.out ? path.resolve(options.out) : artifactsDir(options.dir);
    try {
      const result = await runBuild({ root: options.dir, ...parseBases(options.base) });
      await writeArtifacts(outDir, result);
      printDiagnostics(result.graph.diagnostics);
      console.log(
        `${result.graph.parts.length} parts, ${result.graph.connections.length} connections -> ${outDir}`,
      );
      process.exitCode = result.errors > 0 ? 1 : 0;
    } catch (error) {
      await writeFailure(outDir, error instanceof Error ? error.message : String(error));
      fail(error);
    }
  });

program
  .command("view")
  .description("Build, then serve the viewer on loopback.")
  .option("-C, --dir <dir>", "workspace directory", ".")
  .option("-o, --out <dir>", "artifact directory")
  .option("-p, --port <port>", "port", "4173")
  .option("--base <ref...>", "comparison baseline: <ref>, or <repo>=<ref> per repository", [])
  .option("--watch", "rebuild when inputs change")
  .option("--no-build", "serve existing artifacts without building")
  .option("--no-open", "do not open a browser")
  .action(
    async (options: {
      dir: string;
      out?: string;
      port: string;
      base: string[];
      watch?: boolean;
      build: boolean;
      open: boolean;
    }) => {
      const outDir = options.out ? path.resolve(options.out) : artifactsDir(options.dir);
      const flags = { watch: options.watch ?? false, canRebuild: options.build };
      let selected = parseBases(options.base);
      const rebuild = async () => {
        try {
          const result = await runBuild({ root: options.dir, ...selected });
          await writeArtifacts(outDir, result, flags);
          return result;
        } catch (error) {
          await writeFailure(outDir, error instanceof Error ? error.message : String(error), flags);
          if (!(error instanceof WorkspaceError)) console.error(error);
          return null;
        }
      };

      const first = options.build ? await rebuild() : null;
      if (first) printDiagnostics(first.graph.diagnostics);

      const { url } = await startServer({
        outDir,
        port: Number(options.port),
        ...(options.build
          ? {
              rebuild: async (bases: Record<string, string>) => {
                selected = { ...selected, bases: { ...selected.bases, ...bases } };
                await rebuild();
              },
            }
          : {}),
      });
      console.log(`Archeion is at ${url}`);

      if (options.watch && first) {
        let timer: NodeJS.Timeout | undefined;
        for (const dir of first.repoDirs) {
          watch(dir, { recursive: true }, (_event, file) => {
            const changed = String(file ?? "").replaceAll("\\", "/");
            if (/(^|\/)(\.git|node_modules|\.generated)(\/|$)/.test(changed)) return;
            clearTimeout(timer);
            timer = setTimeout(async () => {
              const result = await rebuild();
              console.log(
                result
                  ? `Rebuilt: ${result.digest.slice(0, 8)}`
                  : "Rebuild failed; keeping the previous graph.",
              );
            }, 300);
          });
        }
      }

      if (options.open) {
        const [command, ...args] =
          process.platform === "win32"
            ? ["cmd", "/c", "start", "", url]
            : process.platform === "darwin"
              ? ["open", url]
              : ["xdg-open", url];
        spawn(command as string, args, { stdio: "ignore", detached: true, windowsHide: true })
          .on("error", () => {})
          .unref();
      }
    },
  );

program
  .command("import-trail")
  .description("Validate an exported trail and write a Markdown trail for owner review.")
  .argument("<file>", "exported trail JSON")
  .option("-C, --dir <dir>", "workspace directory", ".")
  .action(async (file: string, options: { dir: string }) => {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      console.error(`Cannot read ${file}: ${(error as Error).message}`);
      process.exit(1);
    }
    const parsed = trailSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(`${file} is not a compatible trail export:\n${parseError(parsed.error)}`);
      process.exit(1);
    }
    const destination = path.join(path.resolve(options.dir), trailFileName(parsed.data));
    if (existsSync(destination)) {
      console.error(
        `${destination} already exists and was left unchanged. Rename the trail or move the file first.`,
      );
      process.exit(1);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, renderTrail(parsed.data));
    console.log(
      `Wrote ${destination}. Review it and commit it to make it available to future builds.`,
    );
  });

program.parseAsync().catch(fail);
