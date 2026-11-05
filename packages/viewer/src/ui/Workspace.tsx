// The default right-hand frame: what this graph covers, and what it could not establish.
import { useStore } from "../store";
import { FailMark, Frame, shortSha, WarnMark } from "./shared";
import s from "./ui.module.css";

const EXTRACTOR_LABEL: Record<string, string> = {
  csharp: "C#",
  typescript: "TS / TSX",
  openapi: "OpenAPI",
  arm: "ARM",
  configuration: "Configuration",
  manifest: "Manifests",
};

export function Workspace() {
  const index = useStore((state) => state.index);
  if (!index) return null;
  const { graph } = index;
  const repos = graph.comparison.repos.map((row) => row.repo);
  const unknown = graph.connections.filter((c) => c.resolution === "unknown");
  const { open, select } = useStore.getState();

  return (
    <Frame title="Workspace" grow>
      <h3 className={s.inspectorName}>{graph.workspace.name}</h3>

      <h3 className={s.sectionTitle}>Repositories</h3>
      <ul>
        {graph.repos
          .filter((repo) => repos.includes(repo.id))
          .map((repo) => (
            <li className={s.evidenceRow} key={repo.id}>
              <span className={s.rowTitle}>
                <span>{repo.name}</span>
                <span className={`${s.mono} ${s.dim}`}>
                  {repo.git ? shortSha(repo.head) : "no Git"}
                </span>
              </span>
              {repo.branch ? <span className={s.rowMeta}>on {repo.branch}</span> : null}
            </li>
          ))}
      </ul>

      <h3 className={s.sectionTitle}>What was read</h3>
      <p className={s.note} style={{ marginBottom: 6 }}>
        Supported evidence only. Something absent here is not established as absent from the system.
      </p>
      {repos.map((repo) => {
        const rows = graph.coverage.filter(
          (c) => c.repo === repo && (c.filesScanned > 0 || c.unsupported.length > 0),
        );
        const unsupported = rows.flatMap((c) =>
          c.unsupported.map((u) => ({ ...u, extractor: c.extractor })),
        );
        return (
          <details key={repo} open={repos.length === 1}>
            <summary>
              {repo}
              {unsupported.length > 0 ? (
                <span className={s.dim}> · {unsupported.length} not read</span>
              ) : null}
            </summary>
            {rows.length === 0 ? (
              <p className={s.note}>No supported files were found here.</p>
            ) : (
              <table className={s.table}>
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col">Files</th>
                    <th scope="col">Facts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.extractor}>
                      <td>{EXTRACTOR_LABEL[row.extractor]}</td>
                      <td>{row.filesScanned}</td>
                      <td>{row.facts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {unsupported.length > 0 ? (
              <ul style={{ marginTop: 4 }}>
                {unsupported.map((u) => (
                  <li
                    className={s.evidenceRow}
                    key={`${u.extractor}|${u.file}|${u.line}|${u.construct}`}
                  >
                    <span className={s.mono}>
                      {u.file}
                      {u.line ? `:${u.line}` : ""}
                    </span>
                    <span className={s.rowMeta}>{u.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        );
      })}

      {unknown.length > 0 ? (
        <>
          <h3 className={s.sectionTitle}>Unknown connections</h3>
          <ul>
            {unknown.map((connection) => (
              <li key={connection.id}>
                <button
                  type="button"
                  className={s.row}
                  onClick={() => {
                    const from = index.parts.get(connection.from);
                    if (from) useStore.getState().setScope(from.parent);
                    select({ type: "edge", key: connection.id, connections: [connection.id] });
                  }}
                >
                  <span className={s.rowTitle}>
                    <span>
                      {index.parts.get(connection.from)?.name} {connection.verb}{" "}
                      {index.parts.get(connection.to)?.name}
                    </span>
                  </span>
                  <span className={s.rowMeta}>{connection.reason}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3 className={s.sectionTitle}>Issues</h3>
      {graph.diagnostics.length === 0 ? (
        <p className={s.note}>The knowledge and evidence are consistent.</p>
      ) : (
        <ul>
          {graph.diagnostics.map((d) => (
            <li key={`${d.severity}|${d.repo}|${d.file}|${d.line}|${d.code}|${d.message}`}>
              <button
                type="button"
                className={s.row}
                disabled={!d.part || !index.parts.has(d.part)}
                onClick={() => d.part && open(d.part)}
              >
                <span className={s.problem} style={{ padding: 0 }}>
                  {d.severity === "error" ? <FailMark /> : <WarnMark />}
                  <span>{d.message}</span>
                </span>
                {d.file ? (
                  <span className={`${s.mono} ${s.dim}`}>
                    {d.repo ? `${d.repo}:` : ""}
                    {d.file}
                    {d.line ? `:${d.line}` : ""}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}
