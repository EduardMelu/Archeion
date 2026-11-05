// Syntax-first C#/TS/TSX extraction. Supported patterns are listed in docs/EXTRACTION-COVERAGE.md
// beside their fixtures; anything else is reported as unsupported rather than guessed.
import { Language, type Node, Parser } from "web-tree-sitter";
import type { Extraction, Fact, Unsupported } from "./facts";

export interface Grammars {
  csharp: Uint8Array;
  typescript: Uint8Array;
  tsx: Uint8Array;
}

export interface LoadedParsers {
  csharp: Parser;
  typescript: Parser;
  tsx: Parser;
}

let runtimeReady: Promise<void> | undefined;

export async function loadParsers(
  grammars: Grammars,
  runtimeWasm: Uint8Array,
): Promise<LoadedParsers> {
  runtimeReady ??= Parser.init({ wasmBinary: runtimeWasm });
  await runtimeReady;
  const make = async (bytes: Uint8Array) => {
    const parser = new Parser();
    parser.setLanguage(await Language.load(bytes));
    return parser;
  };
  return {
    csharp: await make(grammars.csharp),
    typescript: await make(grammars.typescript),
    tsx: await make(grammars.tsx),
  };
}

function walk(node: Node, visit: (node: Node) => void) {
  visit(node);
  for (const child of node.namedChildren) if (child) walk(child, visit);
}

const lineOfNode = (node: Node) => node.startPosition.row + 1;

// ---------------------------------------------------------------- C#

const MAP_METHODS: Record<string, string> = {
  MapGet: "GET",
  MapPost: "POST",
  MapPut: "PUT",
  MapDelete: "DELETE",
  MapPatch: "PATCH",
};
const CONTROLLER_ATTRIBUTES: Record<string, string> = {
  HttpGet: "GET",
  HttpPost: "POST",
  HttpPut: "PUT",
  HttpDelete: "DELETE",
  HttpPatch: "PATCH",
};
const CLIENT_METHODS: Record<string, string> = {
  GetAsync: "GET",
  GetStringAsync: "GET",
  GetFromJsonAsync: "GET",
  PostAsync: "POST",
  PostAsJsonAsync: "POST",
  PutAsync: "PUT",
  PutAsJsonAsync: "PUT",
  DeleteAsync: "DELETE",
  PatchAsync: "PATCH",
};
const TOPIC_METHODS: Record<string, "publish" | "consume"> = {
  CreateSender: "publish",
  CreateProcessor: "consume",
  CreateReceiver: "consume",
};

function csharpString(node: Node | undefined | null): string | null {
  if (node?.type !== "string_literal") return null;
  const content = node.namedChildren.find((c) => c?.type === "string_literal_content");
  return content?.text ?? "";
}

function firstArgument(args: Node | null): Node | null {
  const argument = args?.namedChildren.find((c) => c?.type === "argument");
  return argument?.namedChildren.at(-1) ?? null;
}

function joinRoute(prefix: string, suffix: string): string {
  return `/${[prefix, suffix]
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/")}`;
}

function attributes(owner: Node): { name: string; argument: string | null; node: Node }[] {
  const out: { name: string; argument: string | null; node: Node }[] = [];
  for (const list of owner.namedChildren) {
    if (list?.type !== "attribute_list") continue;
    for (const attribute of list.namedChildren) {
      if (attribute?.type !== "attribute") continue;
      const name = attribute.childForFieldName("name")?.text ?? "";
      const argumentList = attribute.namedChildren.find(
        (c) => c?.type === "attribute_argument_list",
      );
      const argument = argumentList?.namedChildren[0]?.namedChildren[0];
      out.push({ name, argument: csharpString(argument), node: attribute });
    }
  }
  return out;
}

export function extractCSharp(parser: Parser, file: string, content: string): Extraction {
  const facts: Fact[] = [];
  const unsupported: Unsupported[] = [];
  const tree = parser.parse(content);
  if (!tree) return { facts, unsupported };
  const note = (node: Node, construct: string, message: string) =>
    unsupported.push({ extractor: "csharp", file, line: lineOfNode(node), construct, message });

  walk(tree.rootNode, (node) => {
    if (node.type === "class_declaration") {
      const className = node.childForFieldName("name")?.text ?? "";
      const classRoute = attributes(node).find((a) => a.name === "Route");
      const prefix = (classRoute?.argument ?? "").replace(
        "[controller]",
        className.replace(/Controller$/, "").toLowerCase(),
      );
      const body = node.childForFieldName("body");
      for (const member of body?.namedChildren ?? []) {
        if (member?.type !== "method_declaration") continue;
        for (const attribute of attributes(member)) {
          const method = CONTROLLER_ATTRIBUTES[attribute.name];
          if (!method) continue;
          facts.push({
            type: "route",
            file,
            line: lineOfNode(attribute.node),
            method,
            path: joinRoute(prefix, attribute.argument ?? ""),
            evidence: "code",
          });
        }
      }
      return;
    }

    if (node.type !== "invocation_expression") return;
    const fn = node.childForFieldName("function");
    if (fn?.type !== "member_access_expression") return;
    const name = fn.childForFieldName("name")?.text ?? "";
    const receiver = fn.childForFieldName("expression")?.text ?? "";
    const argument = firstArgument(node.childForFieldName("arguments"));
    const literal = csharpString(argument);

    if (MAP_METHODS[name]) {
      if (literal === null) {
        note(node, name, "Route path is not a string literal.");
      } else {
        facts.push({
          type: "route",
          file,
          line: lineOfNode(node),
          method: MAP_METHODS[name],
          path: joinRoute("", literal),
          evidence: "code",
        });
      }
    } else if (name === "MapGroup") {
      note(
        node,
        "MapGroup",
        "Route group prefixes are not resolved; routes in the group keep their local path.",
      );
    } else if (CLIENT_METHODS[name] && /http|client/i.test(receiver)) {
      if (literal === null) {
        note(node, name, "HTTP client URL is dynamic, so its target is not claimed.");
      } else {
        facts.push({
          type: "http-call",
          file,
          line: lineOfNode(node),
          method: CLIENT_METHODS[name],
          path: literal,
        });
      }
    } else if (TOPIC_METHODS[name]) {
      if (literal === null) {
        note(node, name, "Topic name is not a string literal, so its broker link is not claimed.");
      } else {
        facts.push({
          type: "topic",
          file,
          line: lineOfNode(node),
          topic: literal,
          direction: TOPIC_METHODS[name],
        });
      }
    }
  });
  return { facts, unsupported };
}

// ---------------------------------------------------------------- TS / TSX

const AXIOS_METHODS = new Set(["get", "post", "put", "delete", "patch"]);

function tsString(node: Node | null | undefined): string | null {
  if (node?.type === "string") {
    return node.namedChildren.find((c) => c?.type === "string_fragment")?.text ?? "";
  }
  if (node?.type === "template_string") {
    if (node.namedChildren.some((c) => c?.type === "template_substitution")) return null;
    return node.text.slice(1, -1);
  }
  return null;
}

function fetchMethod(options: Node | null | undefined): string | null {
  if (!options) return "GET";
  if (options.type !== "object") return null;
  for (const pair of options.namedChildren) {
    if (pair?.type !== "pair" || pair.childForFieldName("key")?.text !== "method") continue;
    const value = tsString(pair.childForFieldName("value"));
    return value?.toUpperCase() ?? null;
  }
  return "GET";
}

export function extractTypeScript(parser: Parser, file: string, content: string): Extraction {
  const facts: Fact[] = [];
  const unsupported: Unsupported[] = [];
  const tree = parser.parse(content);
  if (!tree) return { facts, unsupported };

  walk(tree.rootNode, (node) => {
    if (node.type !== "call_expression") return;
    const fn = node.childForFieldName("function");
    const args = node.childForFieldName("arguments")?.namedChildren ?? [];
    const line = lineOfNode(node);
    let method: string | null = null;
    let construct = "";

    if (fn?.type === "identifier" && fn.text === "fetch") {
      construct = "fetch";
      method = fetchMethod(args[1]);
      if (method === null) {
        unsupported.push({
          extractor: "typescript",
          file,
          line,
          construct,
          message: "Request method is not a string literal.",
        });
        return;
      }
    } else if (fn?.type === "member_expression") {
      const object = fn.childForFieldName("object")?.text;
      const property = fn.childForFieldName("property")?.text ?? "";
      if (object !== "axios" || !AXIOS_METHODS.has(property)) return;
      construct = `axios.${property}`;
      method = property.toUpperCase();
    } else {
      return;
    }

    const url = tsString(args[0]);
    if (url === null) {
      unsupported.push({
        extractor: "typescript",
        file,
        line,
        construct,
        message: "Request URL is dynamic, so its target is not claimed.",
      });
      return;
    }
    facts.push({ type: "http-call", file, line, method, path: url });
  });
  return { facts, unsupported };
}
