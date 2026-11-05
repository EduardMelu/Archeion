// Starts real CLI servers over real inputs. Requires `npm run build` first.
import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPlatform } from "./platform.ts";
import { syntheticGraph } from "./synthetic.ts";

const REPO = fileURLToPath(new URL("../", import.meta.url));
export const CLI = path.join(REPO, "packages/cli/dist/cli.js");
export const PORTS = { platform: 4310, self: 4311, synthetic: 4312 };

function serve(args: string[]): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, "view", "--no-open", ...args], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("Archeion is at")) resolve(child);
    });
    child.on("exit", (code) => reject(new Error(`CLI exited with ${code} for ${args.join(" ")}`)));
  });
}

export default async function globalSetup() {
  if (!existsSync(CLI)) throw new Error("Run `npm run build` before the browser tests.");
  const scratch = mkdtempSync(path.join(tmpdir(), "archeion-e2e-"));
  const platform = createPlatform(path.join(scratch, "platform"));

  const synthetic = path.join(scratch, "synthetic");
  mkdirSync(synthetic, { recursive: true });
  const text = `${JSON.stringify(syntheticGraph(), null, 2)}\n`;
  writeFileSync(path.join(synthetic, "graph.json"), text);
  writeFileSync(
    path.join(synthetic, "build-info.json"),
    JSON.stringify({
      version: 1,
      toolVersion: "synthetic",
      builtAt: new Date().toISOString(),
      graphDigest: createHash("sha256").update(text).digest("hex"),
      status: "ok",
      failure: null,
      watch: false,
      canRebuild: false,
    }),
  );

  process.env.ARCHEION_E2E_PLATFORM = platform;
  process.env.ARCHEION_E2E_SCRATCH = scratch;
  const servers = await Promise.all([
    serve(["-C", platform, "--port", String(PORTS.platform)]),
    serve(["-C", REPO, "--port", String(PORTS.self)]),
    serve(["--no-build", "--out", synthetic, "--port", String(PORTS.synthetic)]),
  ]);

  return async () => {
    for (const server of servers) server.kill();
    rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
  };
}
