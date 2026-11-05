# Third-party notices

Archeion's project license applies to its own code. Third-party software and
fonts retain their original licenses. Nothing here changes those terms.

## Built viewer

`npm run build` writes `packages/viewer/dist/THIRD_PARTY_LICENSES.txt` with full
license and copyright notices for packages whose code is retained in rendered
viewer chunks, the three bundled font families, and the ELK layout worker.
The packed CLI includes that file at `dist/viewer/THIRD_PARTY_LICENSES.txt`.
The build fails if an included package has no installed or reviewed notice.
Separate CLI runtime dependencies are installed by npm with their upstream
package files and licenses; they are not folded into Archeion's CLI bundle.

The fonts are Chakra Petch, IBM Plex Sans, and IBM Plex Mono, from their pinned
Fontsource packages, under SIL Open Font License 1.1. Their complete notices
and copyright statements are included in the generated viewer notice file.

Some published packages omit notices, or already contain other software:

- `@react-three/fiber` 9.8.2: the [MIT notice from its release tag](https://github.com/pmndrs/react-three-fiber/blob/d74622ea8ed717f7212d7e19d65ff3e325508389/LICENSE)
  is preserved in `licenses/@react-three__fiber@9.8.2.LICENSE`. Its embedded
  React reconciler is covered by the included React MIT notice.
- `maath` 0.10.8: its [release manifest declares MIT](https://github.com/pmndrs/math/blob/626d198fbae28ba82f2f1b184db7fcafd4d23846/packages/maath/package.json),
  but the release source and npm tarball provide no license file or copyright
  notice. `licenses/maath@0.10.8.LICENSE` records that omission and the MIT terms;
  it does not invent a holder or use the unrelated notice from a later rewrite.
- `elkjs` 0.12.1: used under Eclipse Public License 2.0. The original program
  is unmodified; bundling and minification do not change its source. Its full
  EPL text is included, together with its embedded components' notices.
  Copyright (c) 2017, 2021 Kiel University and others. The original notices also
  identify GPL-3.0-or-later as a conditional secondary license under EPL 2.0.
  Corresponding source is available from the [elkjs release source](https://github.com/kieler/elkjs/tree/624ae90aa37110033a8af59c5ccbb292708b4317)
  and the [ELK 0.12.1 Java source](https://github.com/eclipse-elk/elk/tree/3aa3b9fb98d8f9a41285b3061cff5efe79ed2ba4).
  These source links identify the upstream releases; no reproducible Java/GWT
  rebuild is claimed.
- ELK embeds the browser stub from `web-worker` 1.4.1, Copyright 2020 Google LLC,
  under Apache License 2.0. Its [original source](https://github.com/developit/web-worker/tree/1fda46ca4529fd40274c1e5bbe899a138a158f10)
  and complete license are recorded in `licenses/elkjs-embedded.LICENSE`.
- Additional notices for code already embedded in ELK and Troika's font parsers
  are preserved under `licenses/embedded/` and appended to the generated file.

## Vendored parser grammars

The repository and CLI package contain precompiled grammar WASM files. These
are grammar definitions; the `web-tree-sitter` runtime is a separate npm
dependency. The table in `packages/core/grammars/README.md` records package
versions, grammar ABIs, and binary SHA-256 hashes.

| Grammar files | Original package and license | Source and preserved notice |
| --- | --- | --- |
| `tree-sitter-c_sharp.wasm` | `tree-sitter-c-sharp` 0.23.5, MIT | [Exact release source](https://github.com/tree-sitter/tree-sitter-c-sharp/tree/cac6d5fb595f5811a076336682d5d595ac1c9e85), `packages/core/grammars/licenses/tree-sitter-c-sharp@0.23.5.LICENSE` |
| `tree-sitter-typescript.wasm`, `tree-sitter-tsx.wasm` | `tree-sitter-typescript` 0.23.2, MIT | [Exact release source](https://github.com/tree-sitter/tree-sitter-typescript/tree/f975a621f4e7f532fe322e13c4f79495e0a7b2e7), `packages/core/grammars/licenses/tree-sitter-typescript@0.23.2.LICENSE` |

The complete grammar notices are copied unchanged into `dist/grammars/licenses/`
in the packed CLI. Updates must retain upstream copyright and license terms,
refresh the source versions and hashes, and pass `npm run check:package`.
