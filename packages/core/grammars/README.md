# Vendored parser grammars

Prebuilt WASM files extracted from the published npm tarballs, so the build needs no native toolchain and no `tree-sitter` native peer. They load with `web-tree-sitter` 0.27.1. `test/extract.test.ts` loads each one and asserts its node shapes; CI runs it on Windows and Linux.

| File                          | Source package                  | ABI | SHA-256                                                            |
| ----------------------------- | ------------------------------- | --- | ------------------------------------------------------------------ |
| `tree-sitter-c_sharp.wasm`    | `tree-sitter-c-sharp@0.23.5`    | 15  | `6f69e1cae44e1c32c1eccc170dc5a9778fb94ff716f71113fe1f8c4299aa2f40` |
| `tree-sitter-typescript.wasm` | `tree-sitter-typescript@0.23.2` | 14  | `778025db5a8be0e70f8ccc3671e486dfeddd048c25d9e8a70c26de2e1bf6f97d` |
| `tree-sitter-tsx.wasm`        | `tree-sitter-typescript@0.23.2` | 14  | `79e5da75ea62855a0cd67177685f0164eac87d5f630b3cbe1e0a099751ad30f8` |

To update one, run `npm pack <package>@<version>`, extract the `.wasm` file, and revise this table.
