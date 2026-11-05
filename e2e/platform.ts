// Turns the synthetic fixture into real Git repositories with realistic work in progress.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const FIXTURE = new URL("../fixtures/platform/", import.meta.url);

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function initRepo(dir: string) {
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "fixture@example.invalid");
  git(dir, "config", "user.name", "Fixture Author");
  git(dir, "config", "commit.gpgsign", "false");
  git(dir, "config", "core.autocrlf", "false");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "Initial import");
}

function commit(dir: string, message: string, trailer?: string) {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", trailer ? `${message}\n\n${trailer}` : message);
}

/**
 * shop-web: on a feature branch, a committed styling-library swap with an agent trailer, plus local edits.
 * orders-api: on a feature branch, a committed new module, a removed module, and an untracked file.
 * fulfilment-worker: directly on its default branch with one local edit.
 */
export function createPlatform(root: string): string {
  mkdirSync(root, { recursive: true });
  cpSync(FIXTURE, root, { recursive: true });

  const shop = path.join(root, "shop-web");
  const orders = path.join(root, "orders-api");
  const worker = path.join(root, "fulfilment-worker");
  for (const dir of [shop, orders, worker]) initRepo(dir);

  git(shop, "checkout", "-q", "-b", "feature/new-look");
  const manifestPath = path.join(shop, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  delete manifest.dependencies["styled-components"];
  manifest.dependencies["@emotion/react"] = "11.13.0";
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  commit(shop, "Swap the styling library", "Co-Authored-By: Claude <noreply@example.invalid>");
  const checkout = path.join(shop, "src/checkout/CheckoutPage.tsx");
  writeFileSync(checkout, `${readFileSync(checkout, "utf8")}\n// Work in progress.\n`);

  git(orders, "checkout", "-q", "-b", "feature/refunds");
  const partFile = path.join(orders, ".archeion/parts/orders-service.md");
  writeFileSync(
    partFile,
    readFileSync(partFile, "utf8")
      .replace(
        "links:",
        '  refunds:\n    kind: module\n    does: Returns money to customers when an order is cancelled\n    code: ["src/Orders.Api/Refunds/**"]\nlinks:\n  - refunds uses payments-client',
      )
      .replace(/ {2}legacy-export:\n[\s\S]*?code: \["src\/Orders.Api\/Export\/\*\*"\]\n/, "")
      .replace(/ {2}- legacy-export reads orders-db\n/, ""),
  );
  rmSync(path.join(orders, "src/Orders.Api/Export"), { recursive: true });
  mkdirSync(path.join(orders, "src/Orders.Api/Refunds"), { recursive: true });
  writeFileSync(
    path.join(orders, "src/Orders.Api/Refunds/RefundsClient.cs"),
    "namespace Orders.Api.Refunds;\n\npublic class RefundsClient { }\n",
  );
  commit(orders, "Add refunds");
  writeFileSync(path.join(orders, "tools-note.md"), "An untracked note outside any part.\n");

  const email = path.join(worker, "src/Fulfilment.Worker/Email/EmailSender.cs");
  writeFileSync(email, `${readFileSync(email, "utf8")}\n// Local edit on the default branch.\n`);

  return root;
}

/** The plain fixture, with no Git history, for unchanged-comparison and unavailable states. */
export function createPlainPlatform(root: string): string {
  mkdirSync(root, { recursive: true });
  cpSync(FIXTURE, root, { recursive: true });
  return root;
}
