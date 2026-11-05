// Bundles owned CLI/core code as Node ESM and packages the compiled viewer and parser assets.
// Third-party runtime packages stay explicit npm dependencies.
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const dist = new URL("dist/", root);
const viewer = new URL("../viewer/dist/", root);

if (!existsSync(new URL("index.html", viewer))) {
  throw new Error("Build the viewer first: npm run build -w @archeion/viewer");
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [new URL("src/cli.ts", root).pathname.replace(/^\/([A-Za-z]:)/, "$1")],
  outfile: new URL("cli.js", dist).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: Object.keys(pkg.dependencies),
  logLevel: "warning",
});

cpSync(viewer, new URL("viewer/", dist), { recursive: true });
cpSync(new URL("../core/grammars/", root), new URL("grammars/", dist), {
  recursive: true,
  filter: (source) => !source.endsWith(".md"),
});
for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  cpSync(new URL(`../../${file}`, root), new URL(file, dist));
}
const guides = ["AGENT-ONBOARDING.md", "KNOWLEDGE-FORMAT.md", "EXTRACTION-COVERAGE.md"];
mkdirSync(new URL("docs/", dist));
for (const file of guides) {
  cpSync(new URL(`../../docs/${file}`, root), new URL(`docs/${file}`, dist));
}
// Keep consumer guides local; link the source-only artwork and contributor documents upstream.
const repository = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
const localLinks = new Set([
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  ...guides.map((file) => `docs/${file}`),
]);
const readme = readFileSync(new URL("../../README.md", root), "utf8")
  .replace(/\]\(([^)]+)\)/g, (match, target) =>
    /^(?:https?:|#)/.test(target) || localLinks.has(target.split("#")[0])
      ? match
      : `](${repository}/blob/main/${target})`,
  )
  .replace(/src="([^"\n]+)"/g, (match, target) =>
    /^https?:/.test(target)
      ? match
      : `src="${repository.replace("https://github.com/", "https://raw.githubusercontent.com/")}/main/${target}"`,
  );
writeFileSync(new URL("README.md", dist), readme);
chmodSync(new URL("cli.js", dist), 0o755);
