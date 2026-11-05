// Writes the public JSON Schema files; test/contracts.test.ts fails when they drift.
import { mkdirSync, writeFileSync } from "node:fs";
import { graphJsonSchema, trailJsonSchema } from "../src/contracts.ts";

const dir = new URL("../schema/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL("graph.schema.json", dir), `${JSON.stringify(graphJsonSchema(), null, 2)}\n`);
writeFileSync(new URL("trail.schema.json", dir), `${JSON.stringify(trailJsonSchema(), null, 2)}\n`);
