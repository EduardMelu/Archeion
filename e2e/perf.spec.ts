// The performance gate from the implementation plan, measured on the machine's real GPU.
// Writes reports/perf.json. The budgets are provisional targets; a failure here is real data.
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { expect, test } from "@playwright/test";
import { PORTS } from "./global-setup.ts";
import { STRESS_SCOPE } from "./synthetic.ts";

const BUDGET = { medianFrameMs: 17, p95FrameMs: 20, p95InputMs: 100 };
const MIN_VISIBLE = { nodes: 30, connections: 60 };

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] as number;
};

const summary = (values: number[]) => ({
  samples: values.length,
  medianMs: Number(percentile(values, 0.5).toFixed(2)),
  p95Ms: Number(percentile(values, 0.95).toFixed(2)),
  maxMs: Number(Math.max(...values).toFixed(2)),
});

test("zoom and motion meet the frame and input budgets on the reference device", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  // quality=3 locks the highest setting: adaptive quality must not hide a slow device.
  await page.goto(`http://127.0.0.1:${PORTS.synthetic}/?debug&quality=3`);
  await page.waitForFunction(
    () => (window as never as { __archeion?: unknown }).__archeion !== undefined,
  );
  await page.waitForFunction(
    () => {
      const a = (
        window as never as {
          __archeion: {
            store: {
              getState(): {
                layouts: object;
                index: { graph: { parts: { hasInside: boolean }[] } };
              };
            };
          };
        }
      ).__archeion;
      const state = a.store.getState();
      return (
        Object.keys(state.layouts).length ===
        state.index.graph.parts.filter((p) => p.hasInside).length + 1
      );
    },
    undefined,
    { timeout: 120_000 },
  );

  const measure = (body: string) => page.evaluate(body);
  await measure(`window.__a = window.__archeion; window.__s = () => window.__a.store.getState();`);

  // Warm up fonts and shaders: open the stress view, and let text and materials settle.
  await measure(
    `window.__s().open(${JSON.stringify(STRESS_SCOPE)}); new Promise((r) => setTimeout(r, 2500))`,
  );
  await measure(`window.__s().goUp(); new Promise((r) => setTimeout(r, 1000))`);
  await measure(
    `window.__s().open(${JSON.stringify(STRESS_SCOPE)}); new Promise((r) => setTimeout(r, 1500))`,
  );

  const environment = await page.evaluate(() => {
    const a = (
      window as never as {
        __archeion: {
          renderer(): object;
          visibleCounts(): object;
          stats(): object;
          quality: { getState(): { level: number } };
        };
      }
    ).__archeion;
    return {
      renderer: a.renderer(),
      visible: a.visibleCounts() as { nodes: number; edges: number; totalParts: number },
      qualityLevel: a.quality.getState().level,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      userAgent: navigator.userAgent,
    };
  });
  expect(environment.visible.nodes).toBeGreaterThanOrEqual(MIN_VISIBLE.nodes);
  expect(environment.visible.edges).toBeGreaterThanOrEqual(MIN_VISIBLE.connections);

  // The repeatable sequence: zoom out and in, wheel zoom, then the flow token, with every
  // animation frame rendering the whole scene, including the bloom pass.
  const frames: number[] = (await page.evaluate(`(async () => {
    const samples = [];
    let last = performance.now();
    let running = true;
    const tick = (now) => {
      samples.push(now - last);
      last = now;
      window.__a.invalidate();
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame((now) => { last = now; requestAnimationFrame(tick); });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const canvas = document.querySelector('canvas');
    const box = canvas.getBoundingClientRect();
    for (let round = 0; round < 4; round++) {
      window.__s().goUp();
      await wait(900);
      window.__s().open(${JSON.stringify(STRESS_SCOPE)});
      await wait(900);
      for (let i = 0; i < 40; i++) {
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: i < 20 ? -8 : 8, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, bubbles: true, cancelable: true }));
        await new Promise(requestAnimationFrame);
      }
    }
    window.__s().setEye('tracer');
    window.__s().setFlow('stress-flow');
    window.__s().goToStep(0);
    window.__s().setPlaying(true);
    await wait(6000);
    window.__s().setPlaying(false);
    running = false;
    return samples;
  })()`)) as number[];

  const drawCalls = await page.evaluate(async () => {
    const a = (
      window as never as {
        __archeion: { invalidate(): void; stats(): { calls: number; triangles: number } };
      }
    ).__archeion;
    a.invalidate();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return a.stats();
  });

  // Input to feedback: a real click on the canvas until the frame showing the selection.
  await measure(
    `window.__s().setEye('atlas'); window.__s().select(null); new Promise((r) => setTimeout(r, 800))`,
  );
  await measure(`
    window.__latencies = [];
    window.__pending = null;
    window.addEventListener('pointerdown', (event) => { window.__pending = performance.now(); }, true);
    window.__a.store.subscribe((state, previous) => {
      if (state.selection === previous.selection || window.__pending === null) return;
      const started = window.__pending;
      window.__pending = null;
      requestAnimationFrame(() => requestAnimationFrame(() => window.__latencies.push(performance.now() - started)));
    });
  `);
  const targets = [
    "stress-1-0",
    "stress-2-3",
    "stress-1-5",
    "stress-2-1",
    "stress-3-4",
    "stress-0-2",
  ];
  for (let i = 0; i < 24; i++) {
    const at = await page.evaluate(
      (id) =>
        (
          window as never as {
            __archeion: { screenOf(i: string): { x: number; y: number } | null };
          }
        ).__archeion.screenOf(id),
      targets[i % targets.length] as string,
    );
    expect(at).not.toBeNull();
    await page.mouse.click((at as { x: number }).x, (at as { y: number }).y);
    await page.waitForTimeout(220);
  }
  const latencies = (await measure("window.__latencies")) as number[];
  expect(latencies.length).toBeGreaterThanOrEqual(20);

  const frameSummary = summary(frames);
  const inputSummary = summary(latencies);
  const passed =
    frameSummary.medianMs <= BUDGET.medianFrameMs &&
    frameSummary.p95Ms <= BUDGET.p95FrameMs &&
    inputSummary.p95Ms <= BUDGET.p95InputMs;

  const report = {
    measuredAt: new Date().toISOString(),
    device: {
      cpu: os.cpus()[0]?.model,
      memoryGb: Math.round(os.totalmem() / 2 ** 30),
      platform: `${os.platform()} ${os.release()}`,
    },
    browser: browser.version(),
    ...environment,
    effects: { bloom: environment.qualityLevel >= 1, antialias: "shader-based" },
    budget: BUDGET,
    frames: frameSummary,
    inputToFeedback: inputSummary,
    drawCalls,
    passed,
  };
  mkdirSync("reports/captures", { recursive: true });
  writeFileSync("reports/perf.json", `${JSON.stringify(report, null, 2)}\n`);
  await page.screenshot({ path: "reports/captures/stress-view.png" });
  console.log(JSON.stringify(report, null, 2));

  expect(frameSummary.medianMs, "median frame interval").toBeLessThanOrEqual(BUDGET.medianFrameMs);
  expect(frameSummary.p95Ms, "p95 frame interval").toBeLessThanOrEqual(BUDGET.p95FrameMs);
  expect(inputSummary.p95Ms, "p95 input to feedback").toBeLessThanOrEqual(BUDGET.p95InputMs);
});
