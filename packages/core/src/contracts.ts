// Browser-compatible contracts entry: no Node, filesystem, parser, or server imports.
import { z } from "zod";

export const GRAPH_VERSION = 1;
export const TRAIL_VERSION = 1;

const text = z.string().min(1);
const line = z.number().int().positive().nullable();

export const verbSchema = z.enum(["calls", "reads", "writes", "publishes", "consumes", "uses"]);

export const partKindSchema = z.enum([
  "system",
  "app",
  "service",
  "api",
  "worker",
  "function",
  "module",
  "capability",
  "library",
  "database",
  "cache",
  "queue",
  "storage",
  "secrets",
  "external",
  "agent",
  "unknown",
]);

export const provenanceSchema = z.enum(["reviewed", "extracted", "both"]);

export const evidenceSchema = z.strictObject({
  kind: z.enum(["knowledge", "code", "contract", "infrastructure", "configuration", "manifest"]),
  repo: text,
  file: text,
  line,
  detail: z.string().nullable(),
});

export const dependencySchema = z.strictObject({
  name: text,
  version: z.string().nullable(),
  repo: text,
  manifest: text,
});

export const resourceIdentitySchema = z.strictObject({
  provider: z.literal("azure"),
  type: text,
  identifier: text,
});

export const partSchema = z.strictObject({
  id: text,
  parent: text.nullable(),
  name: text,
  kind: partKindSchema,
  does: z.string(),
  about: z.string().nullable(),
  tech: z.string().nullable(),
  owner: z.string().nullable(),
  hasInside: z.boolean(),
  repos: z.array(text),
  code: z.array(z.strictObject({ repo: text, glob: text })),
  rules: z.array(z.string()),
  reuse: z.array(z.string()),
  topics: z.array(z.string()),
  resource: resourceIdentitySchema.nullable(),
  dependencies: z.array(dependencySchema),
  evidence: z.array(evidenceSchema),
  provenance: provenanceSchema,
  fingerprint: text,
});

export const connectionSchema = z.strictObject({
  id: text,
  from: text,
  to: text,
  verb: verbSchema,
  via: z.string().nullable(),
  provenance: provenanceSchema,
  resolution: z.enum(["resolved", "unknown"]),
  reason: z.string().nullable(),
  crossRepo: z.boolean(),
  evidence: z.array(evidenceSchema),
});

export const flowStepSchema = z.strictObject({
  from: text,
  to: text,
  verb: verbSchema,
  caption: z.string(),
  connection: text.nullable(),
  gap: z.string().nullable(),
});

export const flowSchema = z.strictObject({
  id: text,
  name: text,
  does: z.string(),
  steps: z.array(flowStepSchema),
  evidence: z.array(evidenceSchema),
});

export const extractorSchema = z.enum([
  "csharp",
  "typescript",
  "openapi",
  "arm",
  "configuration",
  "manifest",
]);

export const coverageSchema = z.strictObject({
  repo: text,
  extractor: extractorSchema,
  filesScanned: z.number().int().nonnegative(),
  facts: z.number().int().nonnegative(),
  status: z.enum(["complete", "partial", "unavailable"]),
  unsupported: z.array(z.strictObject({ file: text, line, construct: text, message: z.string() })),
});

export const repoSchema = z.strictObject({
  id: text,
  name: text,
  git: z.boolean(),
  head: z.string().nullable(),
  branch: z.string().nullable(),
  stateId: z.string().nullable(),
});

export const baselineSchema = z.strictObject({
  ref: text,
  sha: text,
  kind: z.enum(["merge-base", "head", "explicit"]),
});

export const comparisonRepoSchema = z.strictObject({
  repo: text,
  status: z.enum(["available", "unavailable"]),
  reason: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  defaultBranchSource: z.enum(["configured", "remote", "inferred", "none"]),
  onDefaultBranch: z.boolean(),
  baseline: baselineSchema.nullable(),
});

export const fileChangeSchema = z.strictObject({
  repo: text,
  path: text,
  previousPath: z.string().nullable(),
  status: z.enum(["added", "modified", "deleted", "renamed"]),
  stage: z.enum(["committed", "staged", "unstaged", "untracked"]),
  parts: z.array(text),
});

export const commitSchema = z.strictObject({
  repo: text,
  sha: text,
  author: z.string(),
  date: z.string(),
  subject: z.string(),
  agentTrailer: z.string().nullable(),
});

export const dependencyChangeSchema = z.strictObject({
  repo: text,
  manifest: text,
  name: text,
  from: z.string().nullable(),
  to: z.string().nullable(),
  local: z.boolean(),
  parts: z.array(text),
});

export const partChangeSchema = z.strictObject({
  part: text,
  status: z.enum(["added", "removed", "changed"]),
  committed: z.boolean(),
  local: z.boolean(),
  agentTrailer: z.string().nullable(),
});

export const removedPartSchema = z.strictObject({
  id: text,
  name: text,
  kind: partKindSchema,
  does: z.string(),
  parent: z.string().nullable(),
  repo: text,
});

export const comparisonSchema = z.strictObject({
  repos: z.array(comparisonRepoSchema),
  files: z.array(fileChangeSchema),
  commits: z.array(commitSchema),
  dependencies: z.array(dependencyChangeSchema),
  parts: z.array(partChangeSchema),
  removedParts: z.array(removedPartSchema),
});

export const eyeSchema = z.enum(["atlas", "tracer", "radar", "sonar"]);

export const trailStepSchema = z.strictObject({
  eye: eyeSchema,
  scope: z.string().nullable(),
  selected: z.string().nullable(),
  flow: z.string().nullable(),
  flowStep: z.number().int().nullable(),
  query: z.string().nullable(),
  note: z.string(),
  targets: z.array(z.strictObject({ part: text, fingerprint: z.string().nullable() })),
});

export const trailSchema = z.strictObject({
  version: z.literal(TRAIL_VERSION),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: text,
  question: z.string(),
  finding: z.string().nullable(),
  author: z.string().nullable(),
  snapshot: z.strictObject({
    graphDigest: z.string().nullable(),
    repos: z.array(
      z.strictObject({ repo: text, head: z.string().nullable(), stateId: z.string().nullable() }),
    ),
  }),
  steps: z.array(trailStepSchema),
});

export const diagnosticSchema = z.strictObject({
  severity: z.enum(["error", "warning"]),
  code: text,
  message: text,
  repo: z.string().nullable(),
  file: z.string().nullable(),
  line,
  part: z.string().nullable(),
});

export const graphSchema = z.strictObject({
  version: z.literal(GRAPH_VERSION),
  workspace: z.strictObject({ id: text, name: text }),
  repos: z.array(repoSchema),
  parts: z.array(partSchema),
  connections: z.array(connectionSchema),
  flows: z.array(flowSchema),
  coverage: z.array(coverageSchema),
  comparison: comparisonSchema,
  trails: z.array(trailSchema),
  diagnostics: z.array(diagnosticSchema),
});

export const buildInfoSchema = z.strictObject({
  version: z.literal(GRAPH_VERSION),
  toolVersion: text,
  builtAt: text,
  graphDigest: z.string().nullable(),
  status: z.enum(["ok", "failed"]),
  failure: z.string().nullable(),
  watch: z.boolean(),
  canRebuild: z.boolean(),
});

export type Verb = z.infer<typeof verbSchema>;
export type PartKind = z.infer<typeof partKindSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Dependency = z.infer<typeof dependencySchema>;
export type Part = z.infer<typeof partSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type Flow = z.infer<typeof flowSchema>;
export type FlowStep = z.infer<typeof flowStepSchema>;
export type Extractor = z.infer<typeof extractorSchema>;
export type Coverage = z.infer<typeof coverageSchema>;
export type Repo = z.infer<typeof repoSchema>;
export type ComparisonRepo = z.infer<typeof comparisonRepoSchema>;
export type FileChange = z.infer<typeof fileChangeSchema>;
export type Commit = z.infer<typeof commitSchema>;
export type DependencyChange = z.infer<typeof dependencyChangeSchema>;
export type PartChange = z.infer<typeof partChangeSchema>;
export type RemovedPart = z.infer<typeof removedPartSchema>;
export type Comparison = z.infer<typeof comparisonSchema>;
export type Eye = z.infer<typeof eyeSchema>;
export type Trail = z.infer<typeof trailSchema>;
export type TrailStep = z.infer<typeof trailStepSchema>;
export type Diagnostic = z.infer<typeof diagnosticSchema>;
export type Graph = z.infer<typeof graphSchema>;
export type BuildInfo = z.infer<typeof buildInfoSchema>;

export const graphJsonSchema = () => z.toJSONSchema(graphSchema);
export const trailJsonSchema = () => z.toJSONSchema(trailSchema);
