import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  updateSnapshots: "missing",
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" },
  },
  use: {
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    acceptDownloads: true,
  },
  projects: [
    {
      // Software WebGL, so results do not depend on the machine's GPU.
      name: "functional",
      testMatch: /(acceptance|cli)\.spec\.ts/,
      use: {
        launchOptions: {
          args: [
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
          ],
        },
      },
    },
    {
      // The real GPU: the only place a frame-time measurement means anything.
      name: "perf",
      testMatch: /perf\.spec\.ts/,
      use: {
        launchOptions: { args: ["--ignore-gpu-blocklist", "--enable-gpu"] },
      },
    },
  ],
});
