// Parses supplied `.archeion` Markdown/YAML into declarations plus positioned diagnostics.
import type { Code, Heading, List, Paragraph, Root, RootContent, Yaml } from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { isMap, isScalar, LineCounter, parseDocument, parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  type Diagnostic,
  partKindSchema,
  type resourceIdentitySchema,
  TRAIL_VERSION,
  type Trail,
  trailStepSchema,
  type Verb,
  verbSchema,
} from "./contracts";

export interface SourceFile {
  path: string;
  hash: string;
  /** Null for binary or oversized files, which are fingerprinted but never parsed. */
  content: string | null;
}

export interface PartDeclaration {
  id: string;
  parent: string | null;
  name: string;
  kind: z.infer<typeof partKindSchema>;
  does: string;
  about: string | null;
  tech: string | null;
  owner: string | null;
  code: string[];
  contract: string | null;
  rules: string[];
  reuse: string[];
  topics: string[];
  httpTargets: Record<string, string>;
  resource: z.infer<typeof resourceIdentitySchema> | null;
  repo: string;
  file: string;
  line: number;
}

export interface Contribution {
  part: string;
  code: string[];
  reuse: string[];
  repo: string;
  file: string;
  line: number;
}

export interface LinkDeclaration {
  from: string;
  verb: Verb;
  to: string;
  via: string | null;
  repo: string;
  file: string;
  line: number;
}

export interface FlowDeclaration {
  id: string;
  name: string;
  does: string;
  steps: { from: string; verb: Verb; to: string; caption: string; line: number }[];
  repo: string;
  file: string;
  line: number;
}

export interface PartProse {
  part: string;
  about: string | null;
  rules: string[];
  reuse: string[];
}

export interface RepoKnowledge {
  repo: string;
  name: string | null;
  ignore: string[];
  parts: PartDeclaration[];
  contributions: Contribution[];
  prose: PartProse[];
  links: LinkDeclaration[];
  flows: FlowDeclaration[];
  trails: Trail[];
  diagnostics: Diagnostic[];
}

export const KNOWLEDGE_DIR = ".archeion/";
export const BUDGETS = {
  linesPerFile: 150,
  partsPerMap: 12,
  doesLength: 100,
  flowSteps: 12,
} as const;

const partDeclarationSchema = z.strictObject({
  kind: partKindSchema,
  name: z.string().min(1).optional(),
  parent: z.string().min(1).optional(),
  does: z.string().default(""),
  tech: z.string().optional(),
  owner: z.string().optional(),
  code: z.array(z.string()).default([]),
  contract: z.string().optional(),
  rules: z.array(z.string()).default([]),
  reuse: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  httpTargets: z.record(z.string(), z.string()).default({}),
  resource: z.strictObject({ type: z.string().min(1), identifier: z.string().min(1) }).optional(),
});

const contributionSchema = z.strictObject({
  code: z.array(z.string()).default([]),
  reuse: z.array(z.string()).default([]),
});

const frontmatterSchema = z.looseObject({
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  ignore: z.array(z.string()).optional(),
});

export const workspaceSchema = z.strictObject({
  archeion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  repos: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        path: z.string().min(1),
        defaultBranch: z.string().min(1).optional(),
        base: z.string().min(1).optional(),
      }),
    )
    .min(1),
});
export type WorkspaceConfig = z.infer<typeof workspaceSchema>;

const LINK = /^(\S+)\s+(\S+)\s+(\S+)(?:\s+via\s+(.+))?$/;
// Zero-width characters, bidirectional controls, and the byte-order mark.
const HIDDEN_CODE_POINTS: [number, number][] = [
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  [0xfeff, 0xfeff],
];
const hasHiddenUnicode = (text: string) =>
  [...text].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return HIDDEN_CODE_POINTS.some(([from, to]) => code >= from && code <= to);
  });
const parser = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]);

export function titleCase(id: string): string {
  return id
    .split(/[-_.]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function plainText(node: { children?: unknown[]; value?: unknown }): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map((child) => plainText(child as typeof node)).join("");
}

interface Sections {
  frontmatter: Record<string, unknown>;
  about: string | null;
  bullets: Record<string, string[]>;
  blocks: { value: string; line: number }[];
}

function readSections(content: string): Sections {
  const tree = parser.parse(content) as Root;
  const result: Sections = {
    frontmatter: {},
    about: null,
    bullets: {},
    blocks: [],
  };
  let section: string | null = null;
  for (const node of tree.children as RootContent[]) {
    if (node.type === "yaml") {
      result.frontmatter = (parseYaml((node as Yaml).value) ?? {}) as Record<string, unknown>;
    } else if (node.type === "heading") {
      if ((node as Heading).depth > 1) section = plainText(node).trim().toLowerCase();
    } else if (node.type === "paragraph" && section === null && result.about === null) {
      result.about = plainText(node as Paragraph).trim();
    } else if (node.type === "list" && section) {
      result.bullets[section] = (node as List).children.map((item) => plainText(item).trim());
    } else if (node.type === "code" && (node as Code).lang === "archeion") {
      result.blocks.push({
        value: (node as Code).value,
        line: (node.position?.start.line ?? 0) + 1,
      });
    }
  }
  return result;
}

function isTrailInput(data: unknown): data is { steps: unknown[] } {
  return (
    typeof data === "object" && data !== null && Array.isArray((data as { steps?: unknown }).steps)
  );
}

/** Parses one repository's knowledge files, which must be repo-relative under `.archeion/`. */
export function parseKnowledge(
  repo: string,
  files: Pick<SourceFile, "path" | "content">[],
): RepoKnowledge {
  const out: RepoKnowledge = {
    repo,
    name: null,
    ignore: [],
    parts: [],
    contributions: [],
    prose: [],
    links: [],
    flows: [],
    trails: [],
    diagnostics: [],
  };
  const report = (
    severity: Diagnostic["severity"],
    code: string,
    message: string,
    file: string,
    line: number | null = null,
    part: string | null = null,
  ) => out.diagnostics.push({ severity, code, message, repo, file, line, part });

  const sorted = files
    .filter((f) => f.path.startsWith(KNOWLEDGE_DIR) && f.path.endsWith(".md") && f.content !== null)
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const { path, content } of sorted) {
    const source = content as string;
    if (source.split("\n").length > BUDGETS.linesPerFile) {
      report(
        "error",
        "budget-lines",
        `Knowledge file exceeds ${BUDGETS.linesPerFile} lines.`,
        path,
      );
    }
    if (hasHiddenUnicode(source)) {
      report(
        "error",
        "hidden-unicode",
        "Knowledge file contains hidden or bidirectional Unicode.",
        path,
      );
    }

    let sections: Sections;
    try {
      sections = readSections(source);
    } catch (error) {
      report("error", "invalid-frontmatter", `Cannot read frontmatter: ${String(error)}`, path);
      continue;
    }
    const front = frontmatterSchema.safeParse(sections.frontmatter);
    if (!front.success) {
      report("error", "invalid-frontmatter", z.prettifyError(front.error), path, 1);
      continue;
    }

    if (path === `${KNOWLEDGE_DIR}system.md`) {
      out.name = front.data.name ?? null;
      out.ignore = front.data.ignore ?? [];
    }

    if (path.startsWith(`${KNOWLEDGE_DIR}flows/`)) {
      readFlow(path, sections, front.data, out, report);
      continue;
    }
    if (path.startsWith(`${KNOWLEDGE_DIR}trails/`)) {
      readTrail(path, sections, front.data, out, report);
      continue;
    }

    const isPartFile = path.startsWith(`${KNOWLEDGE_DIR}parts/`);
    if (isPartFile && !front.data.id) {
      report("error", "missing-id", "A part file needs an `id` in its frontmatter.", path, 1);
      continue;
    }
    const owner = isPartFile ? (front.data.id as string) : null;
    for (const block of sections.blocks) readMap(path, block, owner, out, report);

    if (owner) {
      out.prose.push({
        part: owner,
        about: sections.about,
        rules: sections.bullets.rules ?? [],
        reuse: sections.bullets.reuse ?? [],
      });
    }
  }
  return out;
}

function readMap(
  path: string,
  block: { value: string; line: number },
  owner: string | null,
  out: RepoKnowledge,
  report: (
    severity: Diagnostic["severity"],
    code: string,
    message: string,
    file: string,
    line?: number | null,
    part?: string | null,
  ) => void,
) {
  const counter = new LineCounter();
  const doc = parseDocument(block.value, { lineCounter: counter });
  if (doc.errors.length > 0) {
    report(
      "error",
      "invalid-map",
      doc.errors[0]?.message ?? "Invalid map block.",
      path,
      block.line,
    );
    return;
  }
  const at = (offset: number | undefined) =>
    block.line + (offset === undefined ? 0 : counter.linePos(offset).line - 1);

  const lineOfKey = (section: string, key: string) => {
    const map = doc.get(section, true);
    if (!isMap(map)) return block.line;
    const pair = map.items.find((item) => isScalar(item.key) && item.key.value === key);
    return at(isScalar(pair?.key) ? pair.key.range?.[0] : undefined);
  };

  const data = (doc.toJS() ?? {}) as {
    parts?: Record<string, unknown>;
    contributes?: Record<string, unknown>;
    links?: unknown[];
  };

  const partEntries = Object.entries(data.parts ?? {});
  if (partEntries.length > BUDGETS.partsPerMap) {
    report(
      "error",
      "budget-parts",
      `A map block declares ${partEntries.length} parts; the limit is ${BUDGETS.partsPerMap}. Split into a part file.`,
      path,
      block.line,
    );
  }
  for (const [id, raw] of partEntries) {
    const parsed = partDeclarationSchema.safeParse(raw);
    const line = lineOfKey("parts", id);
    if (!parsed.success) {
      report(
        "error",
        "invalid-part",
        `Part ${id}: ${z.prettifyError(parsed.error)}`,
        path,
        line,
        id,
      );
      continue;
    }
    const d = parsed.data;
    if (d.does.length > BUDGETS.doesLength) {
      report(
        "error",
        "budget-does",
        `\`does\` exceeds ${BUDGETS.doesLength} characters.`,
        path,
        line,
        id,
      );
    }
    out.parts.push({
      id,
      parent: d.parent ?? owner,
      name: d.name ?? titleCase(id),
      kind: d.kind,
      does: d.does,
      about: null,
      tech: d.tech ?? null,
      owner: d.owner ?? null,
      code: d.code,
      contract: d.contract ?? null,
      rules: d.rules,
      reuse: d.reuse,
      topics: d.topics,
      httpTargets: d.httpTargets,
      resource: d.resource ? { provider: "azure", ...d.resource } : null,
      repo: out.repo,
      file: path,
      line,
    });
  }

  for (const [part, raw] of Object.entries(data.contributes ?? {})) {
    const parsed = contributionSchema.safeParse(raw);
    const line = lineOfKey("contributes", part);
    if (!parsed.success) {
      report(
        "error",
        "invalid-part",
        `Contribution to ${part}: ${z.prettifyError(parsed.error)}`,
        path,
        line,
        part,
      );
      continue;
    }
    out.contributions.push({ part, ...parsed.data, repo: out.repo, file: path, line });
  }

  const linksNode = doc.get("links", true) as
    | { items?: { range?: [number, number, number] }[] }
    | undefined;
  (data.links ?? []).forEach((raw, index) => {
    const line = at(linksNode?.items?.[index]?.range?.[0]);
    const match = typeof raw === "string" ? LINK.exec(raw.trim()) : null;
    const verb = verbSchema.safeParse(match?.[2]);
    if (!match || !verb.success) {
      report(
        "error",
        "invalid-link",
        `Cannot read link: ${JSON.stringify(raw)}. Expected \`from verb to [via detail]\`.`,
        path,
        line,
      );
      return;
    }
    out.links.push({
      from: match[1] as string,
      verb: verb.data,
      to: match[3] as string,
      via: match[4]?.trim() ?? null,
      repo: out.repo,
      file: path,
      line,
    });
  });
}

function readFlow(
  path: string,
  sections: Sections,
  front: z.infer<typeof frontmatterSchema>,
  out: RepoKnowledge,
  report: (
    severity: Diagnostic["severity"],
    code: string,
    message: string,
    file: string,
    line?: number | null,
  ) => void,
) {
  const block = sections.blocks[0];
  if (!front.id || !front.name || !block) {
    report(
      "error",
      "invalid-flow",
      "A flow needs `id`, `name`, and one `archeion` steps block.",
      path,
      1,
    );
    return;
  }
  const counter = new LineCounter();
  const doc = parseDocument(block.value, { lineCounter: counter });
  const data = (doc.toJS() ?? {}) as { steps?: unknown[] };
  const stepNodes = doc.get("steps", true) as
    | { items?: { range?: [number, number, number] }[] }
    | undefined;
  if (doc.errors.length > 0 || !Array.isArray(data.steps)) {
    report("error", "invalid-flow", "The flow block needs a `steps` list.", path, block.line);
    return;
  }
  if (data.steps.length > BUDGETS.flowSteps) {
    report(
      "error",
      "budget-steps",
      `A flow has ${data.steps.length} steps; the limit is ${BUDGETS.flowSteps}.`,
      path,
      block.line,
    );
  }
  const steps: FlowDeclaration["steps"] = [];
  data.steps.forEach((raw, index) => {
    const offset = stepNodes?.items?.[index]?.range?.[0];
    const line = block.line + (offset === undefined ? 0 : counter.linePos(offset).line - 1);
    const [expression, caption] = typeof raw === "string" ? raw.split("|", 2) : [];
    const match = expression ? LINK.exec(expression.trim()) : null;
    const verb = verbSchema.safeParse(match?.[2]);
    if (!match || !verb.success) {
      report(
        "error",
        "invalid-flow-step",
        `Cannot read step: ${JSON.stringify(raw)}. Expected \`from verb to | caption\`.`,
        path,
        line,
      );
      return;
    }
    steps.push({
      from: match[1] as string,
      verb: verb.data,
      to: match[3] as string,
      caption: caption?.trim() ?? "",
      line,
    });
  });
  out.flows.push({
    id: front.id,
    name: front.name,
    does: sections.about ?? "",
    steps,
    repo: out.repo,
    file: path,
    line: 1,
  });
}

function readTrail(
  path: string,
  sections: Sections,
  front: z.infer<typeof frontmatterSchema>,
  out: RepoKnowledge,
  report: (
    severity: Diagnostic["severity"],
    code: string,
    message: string,
    file: string,
    line?: number | null,
  ) => void,
) {
  const block = sections.blocks[0];
  const steps = block ? parseYaml(block.value) : null;
  const meta = front as Record<string, unknown>;
  if (!front.id || !isTrailInput(steps)) {
    report(
      "error",
      "invalid-trail",
      "A trail needs an `id` and one `archeion` steps block.",
      path,
      1,
    );
    return;
  }
  const parsed = z.array(trailStepSchema).safeParse(steps.steps);
  if (!parsed.success) {
    report("error", "invalid-trail", z.prettifyError(parsed.error), path, block?.line ?? 1);
    return;
  }
  out.trails.push({
    version: TRAIL_VERSION,
    id: front.id,
    title: typeof meta.title === "string" ? meta.title : titleCase(front.id),
    question: typeof meta.question === "string" ? meta.question : "",
    finding: typeof meta.finding === "string" ? meta.finding : null,
    author: typeof meta.author === "string" ? meta.author : null,
    snapshot: (meta.snapshot as Trail["snapshot"]) ?? { graphDigest: null, repos: [] },
    steps: parsed.data,
  });
}
