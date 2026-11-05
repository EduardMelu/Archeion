import { describe, expect, it } from "vitest";
import { approach, frameDelta } from "./motion";

describe("demand-rendered motion", () => {
  it("does not consume idle time as an animation frame", () => {
    expect(frameDelta(5)).toBe(0.05);
    expect(approach(0, 1, 5)).toBeLessThan(0.6);
    expect(frameDelta(1 / 60)).toBe(1 / 60);
    expect(frameDelta(-1)).toBe(0);
  });
});
