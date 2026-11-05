# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript on Node.js 24 for core and CLI; React, Vite, and Three.js through React Three Fiber for the viewer; ELK.js for layout. Package manifests and the lockfile record exact versions.

## Users

Architects and developers who need to understand how projects connect, which external resources they use, and how data moves through a system spread across repositories. The map supports finding implementations, discovering existing capabilities, and reviewing changes made by coding agents.

## Product Purpose

Archeion puts a software system's structure on one explorable map, generated from reviewed knowledge and code evidence. Success is an architect answering connection, resource, and flow questions correctly and faster than with the existing documentation.

## Positioning

One stable spatial map, seen through four eyes, built from committed knowledge plus supported code evidence. Exploration makes no LLM calls, and what the tool cannot establish stays visible as unknown rather than being guessed.

## Operating Context

A local CLI reads each repository's committed knowledge folder and supported code, then writes `graph.json`; one command starts the static viewer on loopback. Agents draft and maintain knowledge before the viewer consumes it, and the owner reviews those edits alongside the code.

## Capabilities and Constraints

- Eyes: Atlas (structure), Tracer (prepared flows), Radar (changes against a displayed Git baseline), Sonar (existing capabilities).
- Cutaway zoom from platform to applications/services to modules and capabilities; selection exposes purpose, dependencies, and source evidence.
- Collapsed parents summarise hidden matches and changes; grouping never discards results, changes, or unknowns.
- Saved investigation trails with notes, snapshot identity, and later-change detection.
- A logical system may span repositories. Similar names never merge resources.
- Prepared flows explain architecture; they do not claim traffic was observed. Connected neighbours are context, not proven impact.
- Out of scope: direct Azure-account discovery, live telemetry, history scrubbing, automatic semantic duplicate detection, hosted team features.

## Brand Commitments

Archeion uses a cyan/amber HUD inspired architecture explorer. Each eye changes the visual language while preserving the learned map. Animation explains navigation and prepared data flows. Preserve readable familiar controls; do not invent telemetry, decorative metrics, or copy franchise artwork.

## Evidence on Hand

The tool's own knowledge folder and a synthetic multi-repository platform are the demonstration material. Local verification and measured hardware results are recorded in reports/ACCEPTANCE.md and reports/perf.json; they are not a performance guarantee for other devices. No customer or research-effectiveness claims are established.

## Product Principles

1. Honest maps: every part and connection shows where it came from, and unknown stays unknown.
2. Visual meaning: eye palettes, resource shapes, and motion explain the question being asked; decoration never stands in for system facts.
3. Stable space: the layout is learned once, and eye changes never rearrange it.
4. Reviewed knowledge is the source: generated output never replaces owner judgement.

## Accessibility & Inclusion

Map navigation, eye switching, search, evidence, and playback must work from a keyboard with visible focus. Every colour meaning is doubled by a shape or text. Text contrast is at least 4.5:1, with no glow on text, flashing, or motion at rest; reduced-motion preference and pause are honoured. No conformance level is claimed until it is verified.
