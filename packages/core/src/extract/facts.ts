import type { Extractor } from "../contracts";

export interface RouteFact {
  type: "route";
  file: string;
  line: number | null;
  method: string;
  path: string;
  evidence: "code" | "contract";
}

export interface HttpCallFact {
  type: "http-call";
  file: string;
  line: number;
  method: string;
  path: string;
}

export interface TopicFact {
  type: "topic";
  file: string;
  line: number;
  topic: string;
  direction: "publish" | "consume";
}

export interface ResourceFact {
  type: "resource";
  file: string;
  line: number | null;
  resourceType: string;
  identifier: string;
  /** Sub-resource such as a Service Bus topic, kept as supporting detail. */
  detail: string | null;
  evidence: "infrastructure" | "configuration";
}

export interface ManifestDependencyFact {
  type: "dependency";
  file: string;
  line: number | null;
  name: string;
  version: string | null;
}

export type Fact = RouteFact | HttpCallFact | TopicFact | ResourceFact | ManifestDependencyFact;

export interface Unsupported {
  extractor: Extractor;
  file: string;
  line: number | null;
  construct: string;
  message: string;
}

export interface Extraction {
  facts: Fact[];
  unsupported: Unsupported[];
}

export function lineOf(content: string, needle: string): number | null {
  const index = content.indexOf(needle);
  return index < 0 ? null : content.slice(0, index).split("\n").length;
}
