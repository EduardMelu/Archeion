// The specification's checks, driven through the real CLI and a real browser.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { CLI, PORTS } from "./global-setup.ts";

// quality=0 turns bloom off: software WebGL is slow with it, and these checks are about behaviour.
const PLATFORM = `http://127.0.0.1:${PORTS.platform}/?debug&quality=0`;
const SELF = `http://127.0.0.1:${PORTS.self}/?debug&quality=0`;

interface Bridge {
  store: { getState(): Record<string, never> };
  camera(): { x: number; y: number; zoom: number };
  moving(): boolean;
  frameOnScreen(): { x: number; y: number; w: number; h: number } | null;
  screenOf(id: string): { x: number; y: number; w: number; h: number } | null;
  stats(): { calls: number };
}
declare global {
  interface Window {
    __archeion: Bridge;
  }
}

async function ready(page: Page, url = PLATFORM) {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  // Three reports a shader that fails to compile through console.error, and draws nothing.
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__archeion?.screenOf !== undefined);
  // Every part and label needs its layout before a canvas click can land.
  await page.waitForFunction(() => {
    const state = window.__archeion.store.getState() as unknown as {
      layouts: Record<string, unknown>;
      index: { graph: { parts: { hasInside: boolean }[] } };
    };
    return (
      Object.keys(state.layouts).length ===
      state.index.graph.parts.filter((p) => p.hasInside).length + 1
    );
  });
  await page.waitForTimeout(300);
  return problems;
}

/** Clicks the map where a part is actually drawn, as a person would. */
async function clickPart(page: Page, id: string) {
  await page.waitForFunction((part) => window.__archeion.screenOf(part) !== null, id);
  await settled(page);
  const at = await page.evaluate((part) => window.__archeion.screenOf(part), id);
  if (!at) throw new Error(`${id} is not on the map`);
  await page.mouse.click(at.x, at.y);
}

/** Waits for the camera to come to rest, asking the camera rather than guessing from frames. */
async function settled(page: Page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.waitForFunction(() => !window.__archeion.moving());
}

const inspector = (page: Page) => page.getByRole("region", { name: /Inspector|Connection/ });
const outline = (page: Page) => page.getByRole("navigation", { name: "Parts" });
const crumbs = (page: Page) => page.getByRole("navigation", { name: "Location on the map" });

async function openEvidence(page: Page) {
  await inspector(page)
    .locator("summary")
    .filter({ hasText: "Sources & evidence" })
    .first()
    .click();
}

async function openOption(page: Page, name: string) {
  const more = page.getByLabel("More options", { exact: true });
  if (!(await more.evaluate((element) => (element.parentElement as HTMLDetailsElement).open)))
    await more.click();
  await page.getByRole("button", { name, exact: true }).click();
  if (await more.evaluate((element) => (element.parentElement as HTMLDetailsElement).open))
    await more.click();
}

test.describe("O1: the tool's own map", () => {
  test("one command serves its own architecture, including the viewer", async ({ page }) => {
    const problems = await ready(page, SELF);
    for (const name of ["Core", "CLI", "Viewer"]) {
      await expect(outline(page).getByRole("button", { name, exact: true })).toBeVisible();
    }
    await clickPart(page, "viewer");
    await expect(crumbs(page)).toContainText("Viewer");
    await expect(outline(page).getByRole("button", { name: "Map scene" })).toBeVisible();
    await outline(page).getByRole("button", { name: "Map scene" }).click();
    await expect(inspector(page).getByText("Draws parts, metro lines")).toBeVisible();
    await openEvidence(page);
    await expect(
      inspector(page)
        .getByText(/packages\/viewer\/src\/scene\/MapCanvas\.tsx/)
        .first(),
    ).toBeVisible();
    expect(problems).toEqual([]);
  });
});

test("every shader compiles and every eye draws without a console error", async ({ page }) => {
  const problems = await ready(page);
  await clickPart(page, "orders-service");
  await settled(page);
  for (const key of ["2", "3", "4", "1"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
  await page.getByRole("button", { name: "Use the light theme" }).click();
  await page.waitForTimeout(250);
  expect(problems).toEqual([]);
  // A failed shader still reports draw calls, so also prove part frames reached the screen.
  const painted = await page.evaluate(() => {
    const at = window.__archeion.screenOf("payments-client");
    return at !== null && at.w > 40;
  });
  expect(painted).toBe(true);
});

test.describe("A1 and A2: a platform across repositories", () => {
  test("projects, connections, and Azure resources are inspectable together", async ({ page }) => {
    await ready(page);
    await expect(page.getByText(/in 3 repos/)).toBeVisible();
    for (const name of [
      "Storefront",
      "Orders service",
      "Fulfilment service",
      "Order bus",
      "Orders database",
      "Documents store",
      "Platform vault",
      "Customer communications",
    ]) {
      await expect(outline(page).getByRole("button", { name, exact: true })).toBeVisible();
    }
  });

  test("a logical system holds parts from two repositories", async ({ page }) => {
    await ready(page);
    await clickPart(page, "customer-comms");
    await expect(crumbs(page)).toContainText("Customer communications");
    await outline(page).getByRole("button", { name: "Invoice PDF rendering" }).click();
    await expect(inspector(page).getByText("Orders API", { exact: true })).toBeVisible();
    await outline(page).getByRole("button", { name: "Email notifications" }).click();
    await expect(inspector(page).getByText("Fulfilment worker", { exact: true })).toBeVisible();
  });

  test("both uses of a shared resource are inspectable, with evidence from each repository", async ({
    page,
  }) => {
    await ready(page);
    await clickPart(page, "order-bus");
    const panel = inspector(page);
    await expect(panel.getByRole("heading", { name: "Order bus" })).toBeVisible();
    await panel.getByText("More about this part", { exact: true }).click();
    await expect(panel.getByText("acme-bus", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: /published by\s*Order events/ })).toBeVisible();
    await expect(panel.getByRole("button", { name: /consumed by\s*Order intake/ })).toBeVisible();
    await openEvidence(page);
    await expect(panel.getByText(/^orders-api:infra\/main\.json/).first()).toBeVisible();
    await expect(
      panel.getByText(/fulfilment-worker:src\/Fulfilment\.Worker\/appsettings\.json/).first(),
    ).toBeVisible();
    await panel.getByRole("button", { name: /consumed by\s*Order intake/ }).click();
    await expect(page.getByText("across repositories")).toBeVisible();
    await openEvidence(page);
    await expect(
      page.getByText(/fulfilment-worker:src\/Fulfilment\.Worker\/Worker\.cs:5/),
    ).toBeVisible();
  });

  test("a similarly named resource stays separate", async ({ page }) => {
    await ready(page);
    await expect(
      outline(page).getByRole("button", { name: "acme-orders-sql-replica" }),
    ).toBeVisible();
    await outline(page).getByRole("button", { name: "acme-orders-sql-replica" }).click();
    await openEvidence(page);
    await expect(inspector(page).getByText("extracted", { exact: true })).toBeVisible();
  });
});

test.describe("A3: internals without losing context", () => {
  test("opening a part on the map, reaching evidence, and coming back", async ({ page }) => {
    const problems = await ready(page);
    const home = await page.evaluate(() => window.__archeion.camera());

    await clickPart(page, "orders-service");
    await expect(crumbs(page)).toContainText("Orders service");
    await expect(inspector(page).getByRole("heading", { name: "Orders service" })).toBeVisible();
    await settled(page);
    expect((await page.evaluate(() => window.__archeion.camera())).zoom).toBeGreaterThan(home.zoom);

    await clickPart(page, "payments-client");
    await expect(inspector(page).getByRole("heading", { name: "Payments client" })).toBeVisible();
    await expect(inspector(page).getByText("POST /charges").first()).toBeVisible();
    await openEvidence(page);
    await expect(inspector(page).getByText(/PaymentsClient\.cs:5/)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(crumbs(page).getByRole("button", { name: "Orders service" })).toHaveCount(0);
    await settled(page);
    // Coming back keeps the part selected, so the place you were stays marked.
    await expect(inspector(page).getByRole("heading", { name: "Orders service" })).toBeVisible();
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await settled(page);
    const overview = await page.evaluate(() => window.__archeion.camera());
    expect(overview.zoom).toBeCloseTo(home.zoom, 2);
    expect(overview.x).toBeCloseTo(home.x, 1);
    await expect(inspector(page)).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test("an idle map flies into the clicked module and offers Back and Overview", async ({
    page,
  }) => {
    await ready(page);
    await settled(page);
    await page.waitForTimeout(900);
    const home = await page.evaluate(() => window.__archeion.camera());
    await clickPart(page, "orders-service");
    await page.waitForTimeout(100);
    let duringZoom = home.zoom;
    // Software WebGL may delay the first frame while compiling a material. Observe a real
    // intermediate pose, rather than assuming that 100 ms has rendered a particular frame.
    await expect
      .poll(
        async () => {
          const pose = await page.evaluate(() => ({
            camera: window.__archeion.camera(),
            moving: window.__archeion.moving(),
          }));
          duringZoom = pose.camera.zoom;
          return pose.moving && duringZoom > home.zoom;
        },
        { timeout: 6000, intervals: [16, 32, 50] },
      )
      .toBe(true);
    await settled(page);
    const inside = await page.evaluate(() => window.__archeion.camera());
    expect(inside.zoom).toBeGreaterThan(duringZoom);

    await page.getByRole("button", { name: "Back", exact: true }).click();
    await settled(page);
    await expect(crumbs(page).getByRole("button", { name: "Orders service" })).toHaveCount(0);
    await expect(inspector(page).getByRole("heading", { name: "Orders service" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeDisabled();

    await clickPart(page, "orders-service");
    await settled(page);
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await settled(page);
    await expect(inspector(page)).toHaveCount(0);
    expect((await page.evaluate(() => window.__archeion.camera())).zoom).toBeCloseTo(home.zoom, 2);
  });

  test("inside an opened part, every click means what is under it", async ({ page }) => {
    await ready(page);
    await clickPart(page, "orders-service");
    await settled(page);

    // Each child takes its own click, including one drawn over the part's own box.
    for (const [id, name] of [
      ["orders-endpoints", "Orders endpoints"],
      ["invoices", "Invoices"],
      ["refunds", "Refunds"],
    ] as const) {
      await clickPart(page, id);
      await expect(inspector(page).getByRole("heading", { name })).toBeVisible();
    }

    // The empty frame is solid: it selects the opened part, and no ghost behind it answers.
    const frame = await page.evaluate(() => window.__archeion.frameOnScreen());
    if (!frame) throw new Error("No frame");
    await page.mouse.click(frame.x + frame.w / 2 - 12, frame.y + frame.h / 2 - 12);
    await expect(inspector(page).getByRole("heading", { name: "Orders service" })).toBeVisible();
    await expect(crumbs(page)).toContainText("Orders service");
    await settled(page);
    expect(await page.evaluate(() => window.__archeion.frameOnScreen())).toEqual(frame);
  });

  test("the whole route works from the keyboard, with visible focus", async ({ page }) => {
    await ready(page);
    const row = outline(page).getByRole("button", { name: "Orders service", exact: true });
    await row.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const outlineStyle = await row.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outlineStyle).toBe("solid");
    await page.keyboard.press("Enter");
    await expect(crumbs(page)).toContainText("Orders service");
    await page.keyboard.press("3");
    await expect(page.getByRole("button", { name: /Radar/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("1");
    await page.keyboard.press("Escape");
    await expect(crumbs(page).getByRole("button", { name: "Orders service" })).toHaveCount(0);
  });

  test("four eyes have distinct palettes while keeping the same map pose", async ({ page }) => {
    await ready(page);
    await settled(page);
    const before = await page.evaluate(() => ({
      camera: window.__archeion.camera(),
      at: window.__archeion.screenOf("order-bus"),
    }));
    const accents: string[] = [];
    for (const [key, eye, color] of [
      ["1", "atlas", "#43deec"],
      ["2", "tracer", "#ffbd66"],
      ["3", "radar", "#ff8190"],
      ["4", "sonar", "#69ebbd"],
    ] as const) {
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
      await expect(page.locator("html")).toHaveAttribute("data-eye", eye);
      const accent = await page
        .locator("html")
        .evaluate((element) => getComputedStyle(element).getPropertyValue("--accent").trim());
      expect(accent).toBe(color);
      accents.push(accent);
      expect(
        await page.evaluate(() => ({
          camera: window.__archeion.camera(),
          at: window.__archeion.screenOf("order-bus"),
        })),
      ).toEqual(before);
    }
    expect(new Set(accents).size).toBe(4);
    const after = await page.evaluate(() => ({
      camera: window.__archeion.camera(),
      at: window.__archeion.screenOf("order-bus"),
    }));
    expect(after).toEqual(before);
  });

  test("nothing moves at rest: no frames are requested", async ({ page }) => {
    await ready(page);
    await page.waitForTimeout(600);
    const rendered = await page.evaluate(async () => {
      let frames = 0;
      const { gl } = { gl: document.querySelector("canvas") as HTMLCanvasElement };
      const context = gl.getContext("webgl2") as WebGL2RenderingContext;
      const original = context.drawElements.bind(context);
      context.drawElements = (...args: Parameters<typeof original>) => {
        frames += 1;
        return original(...args);
      };
      const originalArrays = context.drawArrays.bind(context);
      context.drawArrays = (...args: Parameters<typeof originalArrays>) => {
        frames += 1;
        return originalArrays(...args);
      };
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return frames;
    });
    expect(rendered).toBe(0);
  });
});

test.describe("E1: incomplete evidence", () => {
  test("unknowns and unread constructs stay visible and inspectable", async ({ page }) => {
    await ready(page);
    await openOption(page, "Map information");
    const workspace = page.getByRole("region", { name: "Workspace" });
    await expect(workspace.getByText("Shipping calls carrier-api")).toBeVisible();
    await workspace.getByText("shop-web").first().click();
    await expect(workspace.getByText("Request URL is dynamic").first()).toBeVisible();
    await workspace.getByRole("button", { name: /Shipping calls carrier-api/ }).click();
    await expect(
      page.getByText('"carrier-api" is not declared in any connected repository.').first(),
    ).toBeVisible();
    await expect(crumbs(page)).toContainText("Fulfilment service");
  });

  test("an unknown stub can be reached on the map", async ({ page }) => {
    await ready(page);
    await clickPart(page, "fulfilment-service");
    await clickPart(page, "unknown:carrier-api");
    await expect(inspector(page).getByText("Unresolved part", { exact: true })).toBeVisible();
    await expect(inspector(page).getByText(/Referenced by reviewed knowledge/)).toBeVisible();
  });
});

test.describe("T1: following a prepared flow", () => {
  test("plays hop by hop across scopes, pauses, steps, and keeps its gap visible", async ({
    page,
  }) => {
    const problems = await ready(page);
    await page.keyboard.press("2");
    await page.getByRole("button", { name: /Customer places an order/ }).click();
    const playback = page.getByRole("group", { name: "Flow playback" });
    const routes = page.getByRole("region", { name: "Flow routes" });
    await expect(playback.getByText("The checkout page submits the order")).toBeVisible();
    await expect(playback).toContainText("1/10");
    await expect(routes.getByText("Prepared architecture flow · not live traffic")).toBeVisible();
    await expect(routes.getByRole("button", { name: "Pause flow", exact: true })).toBeVisible();

    // Choosing a flow hands focus to playback, so Space pauses it.
    await expect(playback.getByRole("button", { name: "Pause" })).toBeFocused();
    await page.keyboard.press(" ");
    await expect(playback.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(routes.getByRole("button", { name: "Play flow", exact: true })).toBeVisible();
    const paused = await playback.textContent();
    await page.waitForTimeout(1800);
    expect(await playback.textContent()).toBe(paused);

    // Next moves one hop; a hop inside one project plays at that project's scope.
    await page.keyboard.press("ArrowRight");
    await expect(playback).toContainText("The API asks for payment");
    await expect(crumbs(page)).toContainText("Orders service");

    // The inspector follows the hop, so its evidence is in view.
    await expect(page.getByRole("region", { name: "Connection" }).getByText("uses")).toBeVisible();

    // A hop across projects plays at the level where both ends show.
    await page.getByRole("button", { name: /The event goes onto the shared bus/ }).click();
    await expect(crumbs(page).getByRole("button", { name: "Orders service" })).toHaveCount(0);
    await openEvidence(page);
    await expect(
      page
        .getByRole("region", { name: "Connection" })
        .getByText("orders-api:src/Orders.Api/Events/OrderEvents.cs:5"),
    ).toBeVisible();

    // A broken step remains visible.
    await page.getByRole("button", { name: /Booking with the carrier/ }).click();
    await expect(playback.getByRole("img", { name: "Warning" })).toBeVisible();
    await expect(playback).toContainText("not declared");

    // Restart and finish.
    await playback.getByRole("button", { name: "Restart" }).click();
    await expect(playback).toContainText("1/10");
    expect(problems).toEqual([]);
  });

  test("auto-plays and stops at the end", async ({ page }) => {
    await ready(page);
    await page.keyboard.press("2");
    await page.getByRole("button", { name: /Customer downloads an invoice/ }).click();
    const playback = page.getByRole("group", { name: "Flow playback" });
    await expect(playback).toContainText("3/3", { timeout: 20_000 });
    await expect(playback.getByRole("button", { name: "Play" })).toBeVisible({ timeout: 15_000 });
  });

  test("reduced motion keeps the same information and jumps instead of flying", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page);
    const start = await page.evaluate(() => window.__archeion.camera());
    await outline(page).getByRole("button", { name: "Orders service", exact: true }).click();
    await settled(page);
    const end = await page.evaluate(() => window.__archeion.camera());
    expect(end.zoom).toBeGreaterThan(start.zoom);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.__archeion.camera())).toEqual(end);

    await page.keyboard.press("2");
    await page.getByRole("button", { name: /Customer places an order/ }).click();
    await expect(page.getByRole("group", { name: "Flow playback" })).toContainText(
      "The checkout page submits the order",
    );
  });
});

test.describe("R1, R2, R3: Radar", () => {
  test("shows committed and labelled local work against each displayed baseline", async ({
    page,
  }) => {
    await ready(page);
    await page.keyboard.press("3");
    const panel = page.getByRole("region", { name: "Changes" });

    await panel.getByText("Comparison details", { exact: true }).click();
    await expect(panel.getByText("Where this branch split from main").first()).toBeVisible();
    await expect(panel.getByText(/On main: local edits only/)).toBeVisible();

    const row = (name: string) => panel.getByRole("button", { name: new RegExp(`^${name}`) });
    await expect(row("Checkout")).toContainText("local");
    await expect(row("Email notifications")).toContainText("local");
    await expect(row("Refunds")).toContainText("new");
    await expect(row("Refunds")).toContainText("committed");
    await expect(row("Storefront")).toContainText("agent trailer");
    await expect(panel.getByText("@emotion/react")).toBeVisible();
    await expect(panel.getByText("styled-components")).toBeVisible();
    await expect(panel.getByText("removed, was 6.1.0")).toBeVisible();
    await expect(panel.getByText("orders-api:tools-note.md")).toBeVisible();
    await expect(page.getByText(/6 parts changed/)).toBeVisible();
  });

  test("a change inside a collapsed part is summarised, and drilling in reaches it", async ({
    page,
  }) => {
    await ready(page);
    await page.keyboard.press("3");
    const row = outline(page).getByRole("button", { name: /^Orders service/ });
    await expect(row).toContainText("2 changed inside");
    await clickPart(page, "orders-service");
    await expect(outline(page).getByRole("button", { name: /^Refunds/ })).toContainText("new");
    await clickPart(page, "refunds");
    await expect(
      inspector(page).getByText("src/Orders.Api/Refunds/RefundsClient.cs").first(),
    ).toBeVisible();
  });

  test("a removed part stays inspectable, and connected context is labelled honestly", async ({
    page,
  }) => {
    await ready(page);
    await page.keyboard.press("3");
    await page.getByRole("button", { name: /^Legacy export/ }).click();
    await expect(inspector(page).getByText(/no place on the current map/)).toBeVisible();
    await expect(page.getByText(/not proven impact/)).toBeVisible();
  });

  test("another reference can be chosen, and a missing one is reported", async ({ page }) => {
    await ready(page);
    await page.keyboard.press("3");
    const panel = page.getByRole("region", { name: "Changes" });
    await panel.getByText("Comparison details", { exact: true }).click();
    await panel.getByText("Compare with another reference").click();
    const field = panel.getByRole("textbox", {
      name: "Another Git reference for fulfilment-worker",
    });

    await field.fill("no-such-reference");
    await field.press("Enter");
    const partial = panel.getByRole("status");
    await expect(partial.getByRole("heading", { name: "Partial change comparison" })).toBeVisible();
    await expect(partial).toContainText("Compared 2 of 3 repositories");
    await expect(partial.getByText(/Reference "no-such-reference" does not exist/)).toBeVisible();

    await field.fill("HEAD");
    await field.press("Enter");
    await expect(panel.getByText("Chosen reference HEAD")).toBeVisible();
  });
});

test.describe("S1: finding what already exists", () => {
  test("browses reusable capabilities, repositories, and resources without typing", async ({
    page,
  }) => {
    await ready(page);
    await page.keyboard.press("4");
    const panel = page.getByRole("region", { name: "Capability catalog" });
    const categories = panel.getByRole("group", { name: "Capability categories" });
    const repositories = panel.getByRole("group", { name: "Repositories", exact: true });
    await expect(page.getByLabel("Filter by keyword")).toHaveValue("");
    await categories.getByRole("button", { name: "Reusable", exact: true }).click();
    await expect(panel.getByRole("button", { name: /Invoice PDF rendering/ })).toBeVisible();
    await expect(panel.getByRole("button", { name: /Email notifications/ })).toBeVisible();

    await panel.getByText("Filter by repository or topic", { exact: true }).click();
    await repositories.getByRole("button", { name: "Orders API", exact: true }).click();
    await expect(panel.getByRole("button", { name: /Invoice PDF rendering/ })).toBeVisible();
    await expect(panel.getByRole("button", { name: /Email notifications/ })).toHaveCount(0);
    await repositories.getByRole("button", { name: "Orders API", exact: true }).click();

    await categories.getByRole("button", { name: "Resources", exact: true }).click();
    await expect(panel.getByRole("button", { name: /Order bus/ })).toBeVisible();
    await expect(panel.getByRole("button", { name: /Orders database/ })).toBeVisible();
    await expect(panel.getByRole("button", { name: /Invoice PDF rendering/ })).toHaveCount(0);
    await panel.getByRole("button", { name: /Order bus/ }).click();
    await expect(inspector(page).getByRole("heading", { name: "Order bus" })).toBeVisible();
    await expect(inspector(page).getByText("Azure resource", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Filter by keyword")).toHaveValue("");
    await panel.getByText("How discovery works", { exact: true }).click();
    await expect(panel.getByText(/no regex or AI calls/)).toBeVisible();
  });

  test("finds a capability inside a collapsed part, with reuse and evidence", async ({ page }) => {
    const problems = await ready(page);
    await page.keyboard.press("/");
    await expect(page.getByLabel("Filter by keyword")).toBeFocused();
    await page.keyboard.type("render pdf");
    await page.keyboard.press("Enter");

    const panel = page.getByRole("region", { name: "Capability catalog" });
    await expect(panel.getByRole("heading", { name: "1 part", exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: /Invoice PDF rendering/ })).toContainText(
      /Call InvoicePdfRenderer/,
    );
    await expect(panel.getByText("Customer communications", { exact: true })).toBeVisible();
    await expect(outline(page).getByRole("button", { name: /^Customer/ })).toContainText(
      "1 match inside",
    );

    // Following the summary inward from the map.
    await page.keyboard.press("Escape");
    await clickPart(page, "customer-comms");
    await clickPart(page, "invoice-pdf");
    await expect(inspector(page).getByText(/Call InvoicePdfRenderer/)).toBeVisible();
    await openEvidence(page);
    await expect(inspector(page).getByText(/InvoicePdfRenderer\.cs/)).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("an empty result explains itself and does not claim absence", async ({ page }) => {
    await ready(page);
    await page.keyboard.press("4");
    const panel = page.getByRole("region", { name: "Capability catalog" });
    await page.getByLabel("Filter by keyword").fill("quantum teleportation");
    await expect(
      panel.getByText("No documented part matches these filters. Try a broader view."),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByLabel("Filter by keyword")).toHaveValue("");
    await expect(panel.getByRole("button", { name: /Invoice PDF rendering/ })).toBeVisible();
  });

  test("the query can change while moving around, and the map stays stable", async ({ page }) => {
    await ready(page);
    await page.keyboard.press("4");
    const before = await page.evaluate(() => window.__archeion.screenOf("order-bus"));
    await page.getByLabel("Filter by keyword").fill("email");
    await expect(outline(page).getByRole("button", { name: /^Customer/ })).toContainText("match");
    await page.getByLabel("Filter by keyword").fill("database");
    await expect(
      page
        .getByRole("region", { name: "Capability catalog" })
        .getByRole("button", { name: /Orders database/ }),
    ).toBeVisible();
    expect(await page.evaluate(() => window.__archeion.screenOf("order-bus"))).toEqual(before);
  });
});

test.describe("O2: exploration stays local", () => {
  test("zoom, eyes, search, and playback make no request beyond loopback", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) &&
        !["data:", "blob:"].includes(url.protocol)
      ) {
        external.push(request.url());
      }
    });
    await ready(page);
    await clickPart(page, "orders-service");
    await page.keyboard.press("Escape");
    await page.keyboard.press("2");
    await page.getByRole("button", { name: /Customer downloads an invoice/ }).click();
    await page.waitForTimeout(800);
    await page.keyboard.press("3");
    await page.keyboard.press("4");
    await page.getByLabel("Filter by keyword").fill("send email");
    await page.waitForTimeout(300);
    expect(external).toEqual([]);
  });

  test("a part name the bundled font cannot draw makes no font request", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith("http://127.0.0.1") && !/^(data|blob):/.test(request.url())) {
        external.push(request.url());
      }
    });
    const original = await (
      await page.request.get(`http://127.0.0.1:${PORTS.platform}/data/graph.json`)
    ).text();
    const body = original.replace('"name": "Order bus"', '"name": "注文バス"');
    expect(body).not.toBe(original);
    await page.route("**/data/graph.json", (route) =>
      route.fulfill({ contentType: "application/json", body }),
    );
    await page.route("**/data/build-info.json", async (route) => {
      const response = await route.fetch();
      const graphDigest = createHash("sha256").update(body).digest("hex");
      await route.fulfill({ response, json: { ...(await response.json()), graphDigest } });
    });
    await ready(page);
    // The panels show the real name; the canvas draws what its bundled font can.
    await expect(outline(page).getByRole("button", { name: "注文バス" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(external).toEqual([]);
  });
});

test.describe("M1: saved investigations", () => {
  test("save, export, import, reopen, and notice later changes", async ({ page }) => {
    await ready(page);
    const platform = process.env.ARCHEION_E2E_PLATFORM as string;
    await openOption(page, "Saved investigations");
    await page.getByRole("button", { name: "New investigation" }).click();
    await page.getByLabel("Name").fill("Why might payment fail");
    await page.getByLabel("Name").press("Tab");
    await page.getByLabel("Question").fill("Which parts does taking a payment depend on?");
    await page.getByLabel("Question").press("Tab");

    await outline(page).getByRole("button", { name: "Orders service", exact: true }).click();
    await outline(page).getByRole("button", { name: "Payments client" }).click();
    await page.getByLabel("Note for this view").fill("Payment goes out through here.");
    await page.getByRole("button", { name: "Add this view" }).click();
    await expect(
      page.getByRole("button", { name: /Payments client.*tracer|Payments client/ }).last(),
    ).toBeVisible();

    // A draft survives a reload through IndexedDB.
    await page.reload();
    await ready(page);
    await openOption(page, "Saved investigations");
    await page.getByRole("button", { name: /Why might payment fail/ }).click();
    await expect(page.getByLabel("Question")).toHaveValue(/taking a payment/);

    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    const download = await downloading;
    const file = path.join(
      mkdtempSync(path.join(tmpdir(), "archeion-trail-")),
      download.suggestedFilename(),
    );
    await download.saveAs(file);
    expect(JSON.parse(readFileSync(file, "utf8")).id).toBe("why-might-payment-fail");

    execFileSync(process.execPath, [CLI, "import-trail", file, "-C", platform]);
    const markdown = readFileSync(
      path.join(platform, ".archeion/trails/why-might-payment-fail.md"),
      "utf8",
    );
    expect(markdown).toContain("Payment goes out through here.");

    // A later build offers it as a committed trail, and nothing has changed yet.
    await rebuild(page);
    await page.reload();
    await ready(page);
    await openOption(page, "Saved investigations");
    const committed = page.getByRole("region", { name: /Saved investigations/ });
    await committed
      .getByRole("button", { name: /Why might payment fail/ })
      .last()
      .click();
    const report = page.getByRole("region", { name: /Investigation|Committed trail/ });
    await expect(report.getByRole("button", { name: /Payments client\s*unchanged/ })).toBeVisible();

    // Changing that module's code locally, with its description untouched, is noticed.
    appendFileSync(
      path.join(platform, "orders-api/src/Orders.Api/Payments/PaymentsClient.cs"),
      "\n// A later local edit.\n",
    );
    await rebuild(page);
    await page.reload();
    await ready(page);
    await openOption(page, "Saved investigations");
    await page
      .getByRole("button", { name: /Why might payment fail/ })
      .last()
      .click();
    await expect(page.getByRole("button", { name: /Payments client\s*changed/ })).toBeVisible();
    await expect(page.getByText("local work differs")).toBeVisible();

    // Reopening a view restores it.
    await page.getByRole("button", { name: /^Payments client\s*atlas/ }).click();
    await expect(crumbs(page)).toContainText("Orders service");
    await expect(inspector(page).getByRole("heading", { name: "Payments client" })).toBeVisible();
  });

  test("losing browser storage warns and damages nothing", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", {
        get() {
          throw new Error("Storage disabled");
        },
      });
    });
    const problems = await ready(page);
    await openOption(page, "Saved investigations");
    await expect(page.getByText(/Browser storage is unavailable/)).toBeVisible();
    await page.getByRole("button", { name: "New investigation" }).click();
    await page.getByRole("button", { name: "Add this view" }).click();
    await expect(page.getByRole("button", { name: "Export JSON" })).toBeEnabled();
    expect(problems).toEqual([]);
  });
});

async function rebuild(page: Page) {
  const status = await page.evaluate(async () => {
    const response = await fetch("api/rebuild", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bases: {} }),
    });
    return response.status;
  });
  expect(status).toBe(204);
}

test.describe("Generated artifact states", () => {
  test("an incompatible graph is reported clearly, not drawn", async ({ page }) => {
    const body = JSON.stringify({ version: 99 });
    const digest = await page
      .evaluate(async (text) => {
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
      }, body)
      .catch(() => null);
    await page.goto(`http://127.0.0.1:${PORTS.platform}/`);
    const computed =
      digest ??
      (await page.evaluate(async (text) => {
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
      }, body));
    await page.route("**/data/graph.json", (route) =>
      route.fulfill({ contentType: "application/json", body }),
    );
    await page.route("**/data/build-info.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          version: 1,
          toolVersion: "x",
          builtAt: new Date().toISOString(),
          graphDigest: computed,
          status: "ok",
          failure: null,
          watch: false,
          canRebuild: false,
        }),
      }),
    );
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("contract version 99");
  });

  test("no build at all explains what to run", async ({ page }) => {
    await page.route("**/data/build-info.json", (route) =>
      route.fulfill({ status: 404, body: "Not built yet" }),
    );
    await page.goto(`http://127.0.0.1:${PORTS.platform}/`);
    await expect(page.getByRole("alert")).toContainText("archeion build");
  });

  test("a failed rebuild stays visible over the previous graph", async ({ page }) => {
    await page.route("**/data/build-info.json", async (route) => {
      const response = await route.fetch();
      const info = await response.json();
      await route.fulfill({
        response,
        json: { ...info, status: "failed", failure: "workspace.yaml is broken." },
      });
    });
    await ready(page);
    await expect(page.getByRole("alert")).toContainText("workspace.yaml is broken.");
    await expect(outline(page).getByRole("button", { name: "Order bus" })).toBeVisible();
  });
});

test.describe("Watch mode and layout continuity", () => {
  test("a new part arrives without moving the others, and rearranging is explicit", async ({
    page,
  }) => {
    const scratch = mkdtempSync(path.join(tmpdir(), "archeion-watch-"));
    const workspace = path.join(scratch, "platform");
    cpSync(new URL("../fixtures/platform/", import.meta.url), workspace, { recursive: true });
    const port = 4319;
    const child = spawn(
      process.execPath,
      [CLI, "view", "--no-open", "--watch", "-C", workspace, "--port", String(port)],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    await new Promise<void>((resolve) => {
      child.stdout?.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("Archeion is at")) resolve();
      });
    });
    try {
      await ready(page, `http://127.0.0.1:${port}/?debug&quality=0`);
      await clickPart(page, "order-bus");
      const before = await page.evaluate(
        () =>
          (
            window.__archeion.store.getState() as unknown as {
              layouts: Record<string, { nodes: Record<string, unknown> }>;
            }
          ).layouts["(root)"]?.nodes,
      );

      const file = path.join(workspace, ".archeion/system.md");
      const content = readFileSync(file, "utf8");
      const { writeFileSync } = await import("node:fs");
      writeFileSync(
        file,
        content.replace(
          "  payment-gateway:",
          "  fraud-screening:\n    kind: external\n    does: Screens payments for fraud\n  payment-gateway:",
        ),
      );

      // The viewer notices by polling build metadata; the selection survives.
      await expect(outline(page).getByRole("button", { name: "Fraud Screening" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(inspector(page).getByRole("heading", { name: "Order bus" })).toBeVisible();

      const after = await page.evaluate(
        () =>
          (
            window.__archeion.store.getState() as unknown as {
              layouts: Record<string, { nodes: Record<string, unknown> }>;
            }
          ).layouts["(root)"]?.nodes,
      );
      for (const [id, box] of Object.entries(before ?? {})) expect(after?.[id]).toEqual(box);
      expect(after?.["fraud-screening"]).toBeDefined();

      await expect(
        page.getByRole("status").filter({ hasText: "placed in free space" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Rearrange" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "placed in free space" }),
      ).toHaveCount(0);

      // A broken edit keeps the last usable map and says so.
      writeFileSync(path.join(workspace, ".archeion/workspace.yaml"), "archeion: nonsense\n");
      await expect(page.getByRole("alert")).toContainText("previous graph", { timeout: 20_000 });
      await expect(outline(page).getByRole("button", { name: "Fraud Screening" })).toBeVisible();
    } finally {
      child.kill();
      rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
    }
  });
});

test.describe("Adaptive quality", () => {
  test("a slow device gives up effects before it gives up the map", async ({ page }) => {
    await ready(page, `http://127.0.0.1:${PORTS.platform}/?debug`);
    const quality = () =>
      page.evaluate(
        () =>
          (
            window.__archeion as unknown as { quality: { getState(): { level: number } } }
          ).quality.getState().level,
      );
    const start = await quality();
    // Deterministically slow: every frame blocks the main thread for longer than the threshold.
    await page.evaluate(() => {
      const block = () => {
        const until = performance.now() + 40;
        while (performance.now() < until);
        requestAnimationFrame(block);
      };
      requestAnimationFrame(block);
    });
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() =>
        (window.__archeion.store.getState() as unknown as { open(id: string): void }).open(
          "orders-service",
        ),
      );
      await settled(page);
      await page.keyboard.press("Escape");
      await settled(page);
    }
    expect(await quality()).toBeLessThan(start);
    await expect(outline(page).getByRole("button", { name: "Order bus" })).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible();
  });
});

test.describe("Light theme and visual checks", () => {
  test("the theme toggles, persists, and stays in step with the canvas", async ({ page }) => {
    await ready(page);
    await page.getByRole("button", { name: "Use the light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Use the dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("controlled captures stay stable", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page);
    await page.waitForTimeout(800);
    const masks = [page.locator("footer")];
    await expect(page).toHaveScreenshot("atlas-dark.png", { mask: masks });

    await outline(page).getByRole("button", { name: "Orders service", exact: true }).click();
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot("cutaway-dark.png", { mask: masks });
  });

  test("narrow windows keep the map and panels usable", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 900 });
    await ready(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("button", { name: /Radar/ })).toBeVisible();
    await outline(page).getByRole("button", { name: "Order bus" }).click();
    await expect(inspector(page).getByRole("heading", { name: "Order bus" })).toBeVisible();
    // Panels keep real height when the page scrolls instead of dividing a fixed one.
    const panelHeight = await inspector(page).evaluate((element) => element.clientHeight);
    expect(panelHeight).toBeGreaterThan(120);
  });
});
