# Viewer redesign verification

Verified locally on 2026-11-05. Scope: the viewer redesign requested with the owner's cyan/amber HUD references. This report does not establish every proposed future capability.

## Behavior and build

- `npm.cmd run build` and `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed, 84 files checked.
- `npm.cmd test -- --run packages/viewer`: 49 tests passed, including browse metadata and idle-frame motion handling.
- Playwright acceptance: all 37 cases verified across the main behavioral run, a focused Radar assertion rerun, and the controlled capture check. The two Atlas/cutaway snapshots were visually reviewed, updated for the intentional redesign, and passed again without updates.
- Impeccable detector: ran once over changed TSX/CSS targets; returned no findings.
- `npm.cmd run check:package`: passed with a temporary npm cache and network access for declared dependency installation. The initial sandboxed attempts could not write the default cache or fetch registry packages. The successful check installed and ran the packed CLI outside this checkout, verified bundled viewer/font/worker/parser assets, scanned C#/TS/TSX, and served the viewer. Nothing was published.

Browser checks cover a real canvas click after idle and an intermediate camera pose, Back and Overview, unchanged map coordinates across four different eye palettes, keyboard discovery, capability browsing without typing, prepared flow playback/pause/step/gaps, reduced motion, multi-repository resource evidence, unavailable and partial Git comparison states, saved-view persistence/export/import, graph rebuild continuity, and narrow windows.

## Render evidence

Screenshots in `.impeccable/review/`: `desktop.png`, `inside.png`, `tracer.png`, `sonar.png`, `radar.png`, `light.png`, `user-3440.png`, and `mobile.png`. Desktop is 1920×1080; the owner's viewport is 3440×1249; mobile is 390×844. The multi-repository platform is explicitly synthetic. Small windows keep the map pannable and provide the parts list as an alternative.

The independent full visual review requested two material fixes: light-mode semantic-label contrast and a stray native marker beside More. Both were fixed in one batch and scored resolved in the final `ship` verdict, limited to those fixes. Measured corrected light Radar contrast was 13.21:1 for the sampled node name and 5.00:1 for the sampled resource header. All eight recaptures were validated. Static recaptures used reduced motion to settle rendering; animation was verified by separate behavioral tests. Final shader, eye-position, and no-update screenshot checks passed on the corrected build.

## Performance

`npm.cmd run perf` passed on AMD Ryzen 7 5825U / Radeon graphics, Windows, Chromium 156, 1920×1080, bloom enabled. A synthetic graph has 483 total parts; the measured view contains 32 nodes and 64 edges.

| Measurement | Observed | Budget |
| --- | ---: | ---: |
| Median frame | 16.7 ms | 17 ms |
| 95th percentile frame | 16.8 ms | 20 ms |
| 95th percentile input response | 31.9 ms | 100 ms |

912 frame samples and 24 input samples were collected. Maximum frame time was 233.3 ms; the percentile pass does not promise zero stalls or the same performance on every device. Full measurement: [perf.json](perf.json).

## Limits

Capability discovery uses prepared purpose/reuse descriptions and explicit metadata, with optional deterministic keyword matching. It makes no LLM calls and does not claim semantic duplicate detection. Flows explain the intended architecture rather than observed traffic. Git comparison remains unavailable where no usable Git baseline exists. Visual review is recorded separately in the design context; no accessibility conformance certification is claimed.
