// Attribute only code retained by the viewer build, plus its separately bundled worker/fonts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const licenses = fileURLToPath(new URL("../licenses/", import.meta.url));
const seeds = [
  "@fontsource/chakra-petch",
  "@fontsource/ibm-plex-mono",
  "@fontsource/ibm-plex-sans",
  "elkjs",
];

export function bundledNotices(moduleIds) {
  const roots = new Set(seeds.map((name) => path.dirname(require.resolve(`${name}/package.json`))));
  for (const id of moduleIds) {
    const root = id
      .replaceAll("\\", "/")
      .match(/(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)(?:\/|$)/)?.[1];
    if (root) roots.add(path.resolve(root));
  }

  const missing = [];
  const notices = [];
  for (const root of roots) {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    const key = `${pkg.name}@${pkg.version}`;
    const files = readdirSync(root).filter((name) =>
      /^(?:licen[sc]e|copying|notice)(?:$|[._-])/i.test(name),
    );
    const override = path.join(
      licenses,
      `${pkg.name.replaceAll("/", "__")}@${pkg.version}.LICENSE`,
    );
    if (existsSync(override)) files.push(override);
    if (files.length === 0) {
      missing.push(key);
      continue;
    }
    const source = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
    notices.push({
      key,
      text: [
        `${key} (${pkg.license ?? "see license below"})`,
        `Package: https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`,
        source ? `Source: ${source.replace(/^git\+/, "")}` : "",
        ...files.map((name) =>
          readFileSync(path.isAbsolute(name) ? name : path.join(root, name), "utf8").trim(),
        ),
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
  }
  if (missing.length)
    throw new Error(`Missing bundled dependency notices: ${missing.sort().join(", ")}`);
  notices.sort((a, b) => a.key.localeCompare(b.key));
  const sections = [
    "Third-party software and fonts included in the Archeion viewer",
    "Generated from rendered build modules and explicit font/ELK worker assets. See THIRD_PARTY_NOTICES.md for vendored parsers and source details.",
    ...notices.map((notice) => notice.text),
    readFileSync(path.join(licenses, "elkjs-embedded.LICENSE"), "utf8").trim(),
    ...readdirSync(path.join(licenses, "embedded"))
      .sort()
      .map(
        (name) =>
          `${name}\n\n${readFileSync(path.join(licenses, "embedded", name), "utf8").trim()}`,
      ),
  ];
  return `${sections.join("\n\n-------------------------------------------------------------------------------\n\n")}\n`;
}
