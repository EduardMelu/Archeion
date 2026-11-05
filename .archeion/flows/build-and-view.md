---
id: build-and-view
name: From knowledge to the map
---

# From knowledge to the map

How a repository's committed knowledge becomes the map on screen. This is a prepared explanation of the design, not a trace of a run.

```archeion
steps:
  - commands uses build-pipeline | `archeion view` starts a build
  - build-pipeline uses git-evidence | Git facts are collected as arguments, never through a shell
  - build-pipeline uses assembler | Files and facts go to the core, as supplied data
  - assembler uses knowledge-reader | Reviewed knowledge becomes declarations
  - assembler uses extractors | Supported code evidence is read
  - build-pipeline writes graph-artifacts | The graph lands atomically, then its metadata
  - local-server reads graph-artifacts | The server exposes only the explicit data routes
  - artifact-loader calls local-server | The viewer verifies the digest and validates once
  - map-scene uses layout-worker | Layout runs in a worker and is cached per scope
```
