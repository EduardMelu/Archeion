// OpenAPI, ARM, configuration, and manifest readers. Configuration values are scanned for known
// Azure hostnames only: nothing else from a value ever reaches a fact, so secrets cannot leak.
import SwaggerParser from "@apidevtools/swagger-parser";
import { parse as parseYaml } from "yaml";
import { type Extraction, type Fact, lineOf, type Unsupported } from "./facts";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "head", "options"];

function findExternalRefs(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) findExternalRefs(item, found);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref" && typeof item === "string" && !item.startsWith("#")) found.push(item);
      else findExternalRefs(item, found);
    }
  }
  return found;
}

export async function extractOpenApi(file: string, content: string): Promise<Extraction> {
  const facts: Fact[] = [];
  const unsupported: Unsupported[] = [];
  const note = (construct: string, message: string, line: number | null = null) =>
    unsupported.push({ extractor: "openapi", file, line, construct, message });

  let document: Record<string, unknown>;
  try {
    document = parseYaml(content) as Record<string, unknown>;
  } catch (error) {
    note("document", `Cannot parse the contract: ${String(error)}`);
    return { facts, unsupported };
  }

  const version = String(document?.openapi ?? document?.swagger ?? "");
  if (!/^(2\.0|3\.0\.|3\.1\.)/.test(version)) {
    note(
      "version",
      `OpenAPI version "${version}" is not supported; expected 2.0, 3.0.x, or 3.1.x.`,
    );
    return { facts, unsupported };
  }

  for (const ref of new Set(findExternalRefs(document))) {
    note(
      "$ref",
      `External reference ${ref} is not resolved; only local references are supported.`,
      lineOf(content, ref),
    );
  }

  try {
    // Remote and file resolution stay disabled: only references inside the supplied document load.
    await SwaggerParser.validate(structuredClone(document) as never, {
      resolve: { external: false },
    });
  } catch (error) {
    note("document", `The contract failed validation: ${(error as Error).message.split("\n")[0]}`);
  }

  const paths = (document.paths ?? {}) as Record<string, Record<string, unknown>>;
  for (const [path, operations] of Object.entries(paths)) {
    for (const method of Object.keys(operations ?? {})) {
      if (!HTTP_METHODS.includes(method)) continue;
      facts.push({
        type: "route",
        file,
        line: lineOf(content, path),
        method: method.toUpperCase(),
        path,
        evidence: "contract",
      });
    }
  }
  return { facts, unsupported };
}

export function isArmTemplate(content: string): boolean {
  return content.includes("deploymentTemplate.json") && content.includes('"resources"');
}

export function extractArm(file: string, content: string): Extraction {
  const facts: Fact[] = [];
  const unsupported: Unsupported[] = [];
  let template: { resources?: unknown };
  try {
    template = JSON.parse(content);
  } catch (error) {
    unsupported.push({
      extractor: "arm",
      file,
      line: null,
      construct: "document",
      message: `Cannot parse JSON: ${String(error)}`,
    });
    return { facts, unsupported };
  }

  const visit = (resources: unknown, parentType: string | null, parentName: string | null) => {
    if (!Array.isArray(resources)) return;
    for (const raw of resources as { type?: unknown; name?: unknown; resources?: unknown }[]) {
      const type = typeof raw.type === "string" ? raw.type : "";
      const name = typeof raw.name === "string" ? raw.name : "";
      if (!type || !name) continue;
      if (name.startsWith("[")) {
        unsupported.push({
          extractor: "arm",
          file,
          line: lineOf(content, name),
          construct: type,
          message: "Resource name is a template expression, so its identity is not claimed.",
        });
        continue;
      }
      const fullType = parentType ? `${parentType}/${type}` : type;
      const segments = fullType.split("/");
      const line = lineOf(content, `"${name}"`);
      if (segments.length > 2) {
        // Nested form "namespace/topic": attribute the sub-resource to its top-level identity.
        const topName = parentName ?? name.split("/")[0] ?? name;
        facts.push({
          type: "resource",
          file,
          line,
          resourceType: segments.slice(0, 2).join("/"),
          identifier: topName,
          detail: `${segments.at(-1)}: ${name.split("/").at(-1)}`,
          evidence: "infrastructure",
        });
      } else {
        facts.push({
          type: "resource",
          file,
          line,
          resourceType: fullType,
          identifier: name,
          detail: null,
          evidence: "infrastructure",
        });
      }
      visit(raw.resources, fullType, parentName ?? name);
    }
  };
  visit(template.resources, null, null);
  return { facts, unsupported };
}

const AZURE_HOSTS: [RegExp, string][] = [
  [/([a-z0-9-]+)\.servicebus\.windows\.net/gi, "Microsoft.ServiceBus/namespaces"],
  [/([a-z0-9-]+)\.database\.windows\.net/gi, "Microsoft.Sql/servers"],
  [/([a-z0-9-]+)\.blob\.core\.windows\.net/gi, "Microsoft.Storage/storageAccounts"],
  [/([a-z0-9-]+)\.vault\.azure\.net/gi, "Microsoft.KeyVault/vaults"],
  [/([a-z0-9-]+)\.redis\.cache\.windows\.net/gi, "Microsoft.Cache/Redis"],
  [/([a-z0-9-]+)\.documents\.azure\.com/gi, "Microsoft.DocumentDB/databaseAccounts"],
];

export function isConfigurationFile(path: string): boolean {
  const name = path.split("/").at(-1) ?? "";
  return /^appsettings(\.[\w-]+)?\.json$/.test(name) || name === "local.settings.json";
}

export function extractConfiguration(file: string, content: string): Extraction {
  const facts: Fact[] = [];
  const unsupported: Unsupported[] = [];
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (error) {
    unsupported.push({
      extractor: "configuration",
      file,
      line: null,
      construct: "document",
      message: `Cannot parse JSON: ${(error as Error).name}`,
    });
    return { facts, unsupported };
  }

  const seen = new Set<string>();
  const visit = (value: unknown, key: string) => {
    if (typeof value === "string") {
      if (value.includes("@Microsoft.KeyVault(") || /^\$\{.+\}$|^#\{.+\}#$/.test(value)) {
        // Report only the key: the value may hold a reference a reader should not see in a graph.
        unsupported.push({
          extractor: "configuration",
          file,
          line: lineOf(content, `"${key}"`),
          construct: key,
          message:
            "Value is resolved at deploy or run time, so any resource behind it is not claimed.",
        });
        return;
      }
      for (const [pattern, resourceType] of AZURE_HOSTS) {
        for (const match of value.matchAll(pattern)) {
          const identifier = (match[1] as string).toLowerCase();
          const id = `${resourceType}|${identifier}`;
          if (seen.has(id)) continue;
          seen.add(id);
          facts.push({
            type: "resource",
            file,
            line: lineOf(content, match[0]),
            resourceType,
            identifier,
            detail: `configured by ${key}`,
            evidence: "configuration",
          });
        }
      }
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
    } else if (value && typeof value === "object") {
      for (const [k, item] of Object.entries(value)) visit(item, k);
    }
  };
  visit(data, "root");
  return { facts, unsupported };
}

export function isManifest(path: string): boolean {
  return path.endsWith("package.json") || path.endsWith(".csproj");
}

export function extractManifest(file: string, content: string): Extraction {
  const facts: Fact[] = [];
  const unsupported: Unsupported[] = [];
  if (file.endsWith("package.json")) {
    try {
      const manifest = JSON.parse(content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const [name, version] of Object.entries({
        ...manifest.devDependencies,
        ...manifest.dependencies,
      })) {
        facts.push({ type: "dependency", file, line: lineOf(content, `"${name}"`), name, version });
      }
    } catch (error) {
      unsupported.push({
        extractor: "manifest",
        file,
        line: null,
        construct: "package.json",
        message: `Cannot parse JSON: ${String(error)}`,
      });
    }
  } else {
    for (const match of content.matchAll(
      /<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]*)")?/g,
    )) {
      const name = match[1] as string;
      facts.push({
        type: "dependency",
        file,
        line: lineOf(content, match[0]),
        name,
        version: match[2] ?? null,
      });
    }
  }
  return { facts, unsupported };
}
