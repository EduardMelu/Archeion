import { describe, expect, it } from "vitest";
import { indexGraph } from "./graphIndex";
import { browse, search } from "./search";
import { part, testGraph } from "./testGraph";

const catalog = indexGraph(
  testGraph({
    repos: [
      { id: "commerce", name: "Commerce API", git: true, head: null, branch: null, stateId: "s" },
      {
        id: "messaging",
        name: "Messaging worker",
        git: true,
        head: null,
        branch: null,
        stateId: "s",
      },
    ],
    parts: [
      part("emails", null, {
        name: "Notifications",
        repos: ["messaging"],
        topics: ["transactional messaging"],
        reuse: ["Send customer email with this module"],
      }),
      part("orders", null, { kind: "api", repos: ["commerce"], topics: ["orders"] }),
      part("db", null, { kind: "database", repos: ["commerce"], tech: "Azure SQL" }),
      part("unknown", null, { kind: "unknown", repos: ["commerce"] }),
    ],
  }),
);

describe("capability browsing", () => {
  it("starts with reusable parts and keeps unknown parts out of the catalog", () => {
    expect(browse(catalog).map((item) => item.id)).toEqual(["emails", "db", "orders"]);
  });

  it("combines explicit category, topic, repository, and optional keyword filters", () => {
    expect(
      browse(catalog, "customer", {
        category: "reusable",
        topic: "transactional messaging",
        repo: "messaging",
      }).map((item) => item.id),
    ).toEqual(["emails"]);
    expect(browse(catalog, "", { category: "services" }).map((item) => item.id)).toEqual([
      "orders",
    ]);
    expect(browse(catalog, "", { category: "resources", repo: "messaging" })).toEqual([]);
    expect(browse(catalog, "sql", { category: "resources" }).map((item) => item.id)).toEqual([
      "db",
    ]);
  });

  it("searches prepared topics and repository names as ordinary words", () => {
    expect(search(catalog, "transactional").map((item) => item.part)).toEqual(["emails"]);
    expect(
      search(catalog, "commerce api")
        .map((item) => item.part)
        .sort(),
    ).toEqual(["db", "orders"]);
    expect(search(catalog, "[messaging]").map((item) => item.part)).toEqual(["emails"]);
  });
});
