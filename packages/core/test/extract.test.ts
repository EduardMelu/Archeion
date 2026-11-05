// Grammar loading and node shapes, directly, so a parser upgrade fails here first.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  extractArm,
  extractConfiguration,
  extractManifest,
  extractOpenApi,
} from "../src/extract/documents";
import {
  extractCSharp,
  extractTypeScript,
  type LoadedParsers,
  loadParsers,
} from "../src/extract/syntax";

let parsers: LoadedParsers;

beforeAll(async () => {
  const grammar = (name: string) => readFileSync(new URL(`../grammars/${name}`, import.meta.url));
  const runtime = createRequire(import.meta.url).resolve("web-tree-sitter");
  parsers = await loadParsers(
    {
      csharp: grammar("tree-sitter-c_sharp.wasm"),
      typescript: grammar("tree-sitter-typescript.wasm"),
      tsx: grammar("tree-sitter-tsx.wasm"),
    },
    readFileSync(path.join(path.dirname(runtime), "web-tree-sitter.wasm")),
  );
});

describe("C#", () => {
  it("reads minimal-API and controller routes", () => {
    const { facts } = extractCSharp(
      parsers.csharp,
      "a.cs",
      `app.MapGet("/health", H);
       [ApiController]
       [Route("api/[controller]")]
       public class InvoicesController {
         [HttpGet("{id}/pdf")] public void Pdf() {}
         [HttpPost] public void Create() {}
       }`,
    );
    expect(facts.map((f) => f.type === "route" && `${f.method} ${f.path}`)).toEqual([
      "GET /health",
      "GET /api/invoices/{id}/pdf",
      "POST /api/invoices",
    ]);
  });

  it("reads literal HTTP calls and topics", () => {
    const { facts } = extractCSharp(
      parsers.csharp,
      "a.cs",
      `class C { void M() {
         _http.PostAsJsonAsync("/charges", body);
         client.GetStringAsync("/status");
         bus.CreateSender("orders");
         bus.CreateProcessor("orders", "subscription");
       } }`,
    );
    expect(facts.map((f) => (f.type === "http-call" ? `${f.method} ${f.path}` : f.type))).toEqual([
      "POST /charges",
      "GET /status",
      "topic",
      "topic",
    ]);
  });

  it("does not mistake an unrelated GetAsync for an HTTP call", () => {
    const { facts } = extractCSharp(
      parsers.csharp,
      "a.cs",
      `class C { void M() { repository.GetAsync("/not-a-url"); } }`,
    );
    expect(facts).toEqual([]);
  });

  it("reports what it will not guess", () => {
    const { facts, unsupported } = extractCSharp(
      parsers.csharp,
      "a.cs",
      `class C { void M(string u, string t) {
         _http.GetAsync(u);
         _http.GetAsync($"/orders/{u}");
         bus.CreateSender(t);
         app.MapGet(u, H);
         app.MapGroup("/admin");
       } }`,
    );
    expect(facts).toEqual([]);
    expect(unsupported.map((u) => u.construct)).toEqual([
      "GetAsync",
      "GetAsync",
      "CreateSender",
      "MapGet",
      "MapGroup",
    ]);
    expect(unsupported[0]).toMatchObject({ file: "a.cs", line: 2 });
  });

  it("survives a file with syntax errors", () => {
    const { facts } = extractCSharp(parsers.csharp, "a.cs", `app.MapGet("/ok", H); class {{{{`);
    expect(facts.map((f) => f.type)).toEqual(["route"]);
  });
});

describe("TS and TSX", () => {
  const source = `
    fetch("/a");
    fetch("/b", { method: "POST" });
    fetch(\`/c\`);
    axios.delete("/d");
  `;

  it("reads literal calls with both grammars", () => {
    for (const parser of [parsers.typescript, parsers.tsx]) {
      const { facts } = extractTypeScript(parser, "a.ts", source);
      expect(facts.map((f) => f.type === "http-call" && `${f.method} ${f.path}`)).toEqual([
        "GET /a",
        "POST /b",
        "GET /c",
        "DELETE /d",
      ]);
    }
  });

  it("reads a call nested in JSX", () => {
    const { facts } = extractTypeScript(
      parsers.tsx,
      "a.tsx",
      `export const P = () => <button onClick={() => fetch("/x")} />;`,
    );
    expect(facts).toHaveLength(1);
  });

  it("reports dynamic URLs and methods", () => {
    const { facts, unsupported } = extractTypeScript(
      parsers.typescript,
      "a.ts",
      `fetch(\`/a/\${id}\`); fetch("/a/" + id); fetch("/b", { method: m }); axios.get(url);`,
    );
    expect(facts).toEqual([]);
    expect(unsupported).toHaveLength(4);
  });

  it("ignores other libraries' methods", () => {
    const { facts, unsupported } = extractTypeScript(
      parsers.typescript,
      "a.ts",
      `cache.get("/x"); map.delete("/y");`,
    );
    expect(facts).toEqual([]);
    expect(unsupported).toEqual([]);
  });
});

describe("OpenAPI", () => {
  const document = (extra = "") => `
openapi: 3.0.3
info: { title: T, version: "1" }
paths:
  /orders/{id}:
    get:
      responses: { "200": { description: ok } }
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
${extra}`;

  it("reads operations, skipping non-operation keys", async () => {
    const { facts, unsupported } = await extractOpenApi("o.yaml", document());
    expect(facts.map((f) => f.type === "route" && `${f.method} ${f.path}`)).toEqual([
      "GET /orders/{id}",
    ]);
    expect(unsupported).toEqual([]);
  });

  it("refuses an unsupported version rather than guessing", async () => {
    const { facts, unsupported } = await extractOpenApi(
      "o.yaml",
      "openapi: 9.9.9\ninfo: { title: T, version: '1' }\npaths: {}\n",
    );
    expect(facts).toEqual([]);
    expect(unsupported[0]?.construct).toBe("version");
  });

  it("reports an external reference and never fetches it", async () => {
    const { unsupported } = await extractOpenApi(
      "o.yaml",
      document("components:\n  schemas:\n    X: { $ref: 'https://example.invalid/x.yaml' }\n"),
    );
    expect(unsupported.map((u) => u.construct)).toContain("$ref");
  });

  it("reports an unreadable document", async () => {
    const { unsupported } = await extractOpenApi("o.yaml", "paths: [unterminated");
    expect(unsupported).toHaveLength(1);
  });
});

describe("ARM", () => {
  it("reads literal resources and nested sub-resources, and reports expressions", () => {
    const { facts, unsupported } = extractArm(
      "main.json",
      JSON.stringify({
        resources: [
          {
            type: "Microsoft.ServiceBus/namespaces",
            name: "bus",
            resources: [{ type: "topics", name: "orders" }],
          },
          { type: "Microsoft.ServiceBus/namespaces/topics", name: "bus/events" },
          { type: "Microsoft.Sql/servers", name: "[parameters('name')]" },
        ],
      }),
    );
    expect(facts.map((f) => f.type === "resource" && [f.identifier, f.detail])).toEqual([
      ["bus", null],
      ["bus", "topics: orders"],
      ["bus", "topics: events"],
    ]);
    expect(unsupported).toHaveLength(1);
  });
});

describe("Configuration", () => {
  it("takes only the hostname from a connection string", () => {
    const content = JSON.stringify({
      Db: "Server=tcp:shop-sql.database.windows.net;Password=hunter2;",
    });
    const { facts } = extractConfiguration("appsettings.json", content);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ identifier: "shop-sql", detail: "configured by Db" });
    expect(JSON.stringify(facts)).not.toContain("hunter2");
  });

  it("reports deploy-time values without repeating them", () => {
    const secret = "@Microsoft.KeyVault(SecretUri=https://kv.vault.azure.net/secrets/s)";
    const { facts, unsupported } = extractConfiguration(
      "appsettings.json",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: this is the literal placeholder under test.
      JSON.stringify({ ApiKey: secret, Other: "${FROM_ENV}" }),
    );
    expect(facts).toEqual([]);
    expect(unsupported.map((u) => u.construct)).toEqual(["ApiKey", "Other"]);
    expect(JSON.stringify(unsupported)).not.toContain("SecretUri");
  });

  it("does not echo a value when the file is not valid JSON", () => {
    const { unsupported } = extractConfiguration("appsettings.json", '{"Password": "hunter2"');
    expect(JSON.stringify(unsupported)).not.toContain("hunter2");
  });
});

describe("Manifests", () => {
  it("reads package.json and csproj dependencies", () => {
    const npm = extractManifest(
      "package.json",
      JSON.stringify({ dependencies: { a: "1" }, devDependencies: { b: "2" } }),
    );
    expect(npm.facts.map((f) => f.type === "dependency" && f.name).sort()).toEqual(["a", "b"]);
    const dotnet = extractManifest(
      "x.csproj",
      `<Project><ItemGroup><PackageReference Include="Serilog" Version="4.0.0" /></ItemGroup></Project>`,
    );
    expect(dotnet.facts[0]).toMatchObject({ name: "Serilog", version: "4.0.0" });
  });
});
