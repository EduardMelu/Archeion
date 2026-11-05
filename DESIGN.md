---
name: Archeion viewer
description: Four visual instruments over one stable architecture map.
colors:
  ground: "#050e17"
  panel: "#091925"
  raised: "#102735"
  line: "#294451"
  line-main: "#4f7c8c"
  text: "#e7f2f7"
  text-dim: "#99afbd"
  accent-ink: "#050e17"
  eye-atlas: "#43deec"
  eye-tracer: "#ffbd66"
  eye-radar: "#ff8190"
  eye-sonar: "#69ebbd"
  resource: "#ffbd66"
  warn: "#f2b84b"
  fail: "#ff5a66"
  agent: "#b69cff"
  light-ground: "#f3f4f6"
  light-panel: "#ffffff"
  light-raised: "#eaecf0"
  light-line: "#b4bac6"
  light-line-main: "#7b8494"
  light-text: "#14171d"
  light-text-dim: "#525c6b"
  light-accent-ink: "#ffffff"
  light-eye-atlas: "#00707f"
  light-eye-tracer: "#885000"
  light-eye-radar: "#ae3146"
  light-eye-sonar: "#006c4d"
  light-resource: "#865000"
  light-warn: "#8a5a00"
  light-fail: "#c2202c"
  light-agent: "#6a3fd6"
typography:
  headline:
    fontFamily: '"Chakra Petch", "Segoe UI", system-ui, sans-serif'
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: '"Chakra Petch", "Segoe UI", system-ui, sans-serif'
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.05em"
  body:
    fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif'
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 400
  small:
    fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif'
    fontSize: "0.6875rem"
    fontWeight: 400
  mono:
    fontFamily: '"IBM Plex Mono", ui-monospace, Consolas, monospace'
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  square: "0"
  badge: "2px"
  panel: "3px"
  map: "4px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.eye-atlas}"
    textColor: "{colors.accent-ink}"
    padding: "7px 12px"
  button-secondary:
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "5px 10px"
  button-text:
    textColor: "{colors.eye-atlas}"
    typography: "{typography.label}"
    padding: "2px 0"
  input:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text}"
    rounded: "{rounded.square}"
    padding: "6px 8px"
  eye-navigation:
    textColor: "{colors.text-dim}"
    rounded: "{rounded.panel}"
    padding: "10px 16px"
  filter-chip:
    textColor: "{colors.text-dim}"
    typography: "{typography.label}"
    padding: "6px 9px"
  frame:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "14px"
  route-card:
    textColor: "{colors.text}"
    padding: "15px 13px"
---

# Design System: Archeion viewer

<!-- Finish review: initial full review returned fix; both material fixes were scored resolved on the verdict pass. Final disposition: ship at the two-fix scope. No accessibility certification or whole-product approval is claimed. -->

## Overview

**Creative North Star: "Four instruments, one map"**

The owner supplied cyan/amber science fiction HUD references to replace the quiet neutral viewer. Ink-blue surfaces, structural brackets, luminous routes, and distinct instrument palettes make architecture exploration expressive while familiar controls keep the map usable.

The architecture stays spatially stable as Atlas, Tracer, Radar, and Sonar change its reading. Motion explains entry into a scope and progress through a prepared flow. Resource outlines and repository identity carry real distinctions; decoration never claims traffic was observed.

**Key Characteristics:**

- A dominant architecture map with compact supporting rails.
- Four recognisable eye palettes over stable geometry.
- Crisp structural lines, restrained corners, and readable unglowing text.
- Continuous cutaway navigation and a visible prepared-flow token.

## Colors

The frontmatter records the DOM palette from [tokens.css](packages/viewer/src/tokens.css); the light-prefixed entries are its explicit theme overrides. The active accent follows the selected eye. Component primitive references show Atlas at rest; the sidecar snippets use the live CSS variables to follow theme and eye changes.

### Primary

Atlas cyan identifies structure, selection, and structural frames. Tracer amber identifies prepared routes and their travelling token. Radar coral identifies changes. Sonar mint identifies existing capabilities and concentric beacons. Eye names, icons, and associated outlines also communicate these meanings.

### Secondary

Warm resource markers distinguish external resources. Warning, failure, and agent colours remain separate semantic roles; an eye accent does not redefine diagnostic meaning.

### Neutral

Ground is the darkest canvas, panel contains controls, and raised distinguishes hover or active surfaces. Text and secondary text form the reading hierarchy; line and line-main separate surfaces without luminous text.

The Three.js scene uses the separately tuned palette in [theme.ts](packages/viewer/src/scene/theme.ts), including plate, grid, outlines, text, and light-theme blue-white surfaces. Its scene colours are intentionally not interchangeable with DOM surface values. Repository colours are stable across scopes and eyes and do not imply that a repository is a logical system.

**The Meaningful Colour Rule.** Couple every colour meaning with a name, icon, shape, or explicit state. Keep diagnostic roles distinct from eye palettes.

## Typography

Chakra Petch provides the instrument voice for headings; IBM Plex Sans carries controls and prose; IBM Plex Mono marks source paths, shortcuts, and compact metadata. All three families are bundled locally. The body uses tabular numerals.

The shared text ramp is small (0.6875rem), label (0.75rem), body (0.8125rem), title (0.9375rem), and large title (1.125rem). Map headings use the headline role and reduce to (20px) below the single-column breakpoint. Inspector names use Chakra Petch at (1.5rem); panel names use (1.3rem). These are compact application headings, not promotional display type.

Use normal sentence case for explanatory copy. Reserve the spaced brand treatment for the existing wordmark. Source paths may wrap; headings must not hide part identity.

## Layout

The desktop shell has a header, flexible map workspace, and status bar. The workspace begins with a browse rail (278px), flexible map, gap (16px), and outer padding (16px 20px 12px). A selection or workspace panel adds a details rail (310px). The map occupies the freed space when details close.

At (1600px), rails become (250px / 290px). At (1180px), workspace padding and gap become (12px), with (228px / 264px) rails when details are present. At (900px), the page scrolls in one column: map first, details second, remaining browse content below. The map has a minimum height of (460px) or (62vh), whichever is greater. Frame bodies cap at (46vh); the minimap hides. At (440px), eye icons hide and map return controls stack.

The spacing scale is a compact four-pixel rhythm. Panel bodies use (14px) inset and rail sections use (12px) gaps; retain these observed exceptions rather than expanding every panel to a generic card layout.

Switching eyes changes the question and visual treatment without relocating the architecture.

## Elevation & Depth

DOM depth comes mainly from tonal surfaces and one-pixel borders. The More menu is an overlay with a soft shadow, while selected rows use an inset accent stroke. The map uses nested frames, receding surroundings, resource contours, and luminous route geometry. Primary part names and repository/resource labels remain opaque as frames and routes recede; secondary details may be omitted to reduce clutter. Glow belongs to scene signals and routes; text stays sharp.

**The Signal Glow Rule.** Use light to reveal a route, selection, or capability; keep reading surfaces and text unglowing.

Exact overlay and selection shadows live in [.impeccable/design.json](.impeccable/design.json), alongside motion and breakpoint extensions.

## Shapes

The form language is predominantly rectilinear: square fields and secondary buttons, slightly softened panels and eye tabs, and a subtly rounded map enclosure. Repository badges use the smallest corner. One-pixel outlines distinguish control boundaries; accent corner brackets mark the map. Circles are meaningful markers, timeline numbers, and travelling tokens rather than a universal container shape.

## Components

### Buttons and fields

Primary actions are filled with the active eye colour and use its contrasting ink, with a minimum height (36px). Secondary buttons are square outlined controls; map Back / Overview controls have a minimum height (34px). Filter chips have a minimum height (32px). Small utility controls are denser, so these measurements are component-specific rather than a global target-size guarantee.

Text actions use an accent underline. Fields use the ground surface, square corners, one-pixel outlines, and an accent caret. Hover raises the outline contrast. Keyboard focus is a two-pixel accent outline with a one-pixel offset. Disabled buttons reduce opacity. The sidecar carries the actual variants and their hover/focus states.

### Navigation and panels

Eye controls combine a distinct icon, name, and purpose. Their selected state adds the eye-coloured border and a lightly tinted panel fill. Breadcrumbs show location; persistent Back and Overview controls sit above the map. The More menu contains saved investigations and workspace information. Opening a part exposes a concise inspector: identity, purpose, resource type, connections, and relevant flows lead; evidence and technical metadata expand on demand.

Sonar begins with capabilities browsed by purpose, the owner's confirmed entry point. Rows surface purpose and reuse cues; category/repository filters are secondary and collapsed initially. Optional keyword matching is local and deterministic. There are no ranking scores or query-language requirements.

### Map and prepared flows

Scope changes use a continuous cutaway camera flight (720ms) with cubic ease-in-out. Tracer uses a screen-legible travelling circle, halo, tail, and route trail; a hop travels for (1150ms), then dwells for (850ms). Playback waits for the camera to settle. Pause and step controls remain explicit, and Escape returns one scope.

CSS state transitions range from (120ms) to (200ms) using the shared ease-out curve. Reduced motion effectively removes CSS transitions, places the camera immediately, and skips route travel while retaining a longer playback dwell (2000ms). The canvas is demand-rendered; do not introduce ambient motion at rest. These are implementation rules, not measured performance claims.

## Do's and Don'ts

### Do

- **Do** preserve the learned map when switching eyes.
- **Do** distinguish repository identity from logical system and external-resource identity.
- **Do** keep Back, Overview, pause, and step actions reachable alongside the map.
- **Do** show purpose and reuse information before technical evidence expansions.
- **Do** respect reduced motion and pair colour with text, icon, or shape.

### Don't

- **Don't** invent telemetry, decorative metrics, ranking scores, or research claims.
- **Don't** present prepared flows as observed traffic or connected neighbours as proven impact.
- **Don't** glow text, flash signals, or run decorative motion at rest.
- **Don't** copy franchise artwork or replace familiar controls with unexplained HUD glyphs.
