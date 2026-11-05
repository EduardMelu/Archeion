import type { Connection, Part } from "@archeion/core/contracts";
import { useMemo, useState } from "react";
import type { GraphIndex } from "../logic/graphIndex";
import { pathTo } from "../logic/graphIndex";
import { motion } from "../scene/motion";
import { useStore } from "../store";
import { Close, Play } from "./icons";
import p from "./Panels.module.css";
import { EvidenceList, FailMark, Frame, ProvenanceTag, shortSha, WarnMark } from "./shared";
import s from "./ui.module.css";

const INCOMING: Record<Connection["verb"], string> = {
  calls: "called by",
  reads: "read by",
  writes: "written by",
  publishes: "published by",
  consumes: "consumed by",
  uses: "used by",
};

const nameOf = (index: GraphIndex, id: string) => index.parts.get(id)?.name ?? id;

function ConnectionRows({ index, part }: { index: GraphIndex; part: Part }) {
  const { select } = useStore.getState();
  const links = index.graph.connections.filter((c) => c.from === part.id || c.to === part.id);
  if (links.length === 0)
    return <p className={s.note}>No connection to this part is established.</p>;
  return (
    <ul>
      {links.map((link) => {
        const outgoing = link.from === part.id;
        return (
          <li key={link.id}>
            <button
              type="button"
              className={s.linkRow}
              onClick={() => select({ type: "edge", key: link.id, connections: [link.id] })}
            >
              <span className={s.verb}>{outgoing ? link.verb : INCOMING[link.verb]}</span>
              <span>
                {nameOf(index, outgoing ? link.to : link.from)}
                {link.resolution === "unknown" ? (
                  <span className={`${s.tag} ${s.tagWarn}`} style={{ marginLeft: 6 }}>
                    unknown
                  </span>
                ) : null}
                {link.via ? <span className={s.rowMeta}>{link.via}</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PartChanges({ index, part }: { index: GraphIndex; part: Part }) {
  const eye = useStore((state) => state.eye);
  const { comparison } = index.graph;
  const change = index.changes.get(part.id);
  const inside = useMemo(() => {
    return comparison.files.filter((f) =>
      f.parts.some((id) => id === part.id || pathTo(index, id).includes(part.id)),
    );
  }, [comparison.files, index, part.id]);
  const dependencies = comparison.dependencies.filter((d) => d.parts.includes(part.id));
  if (!change && inside.length === 0 && dependencies.length === 0) return null;
  return (
    <details className={p.detail} open={eye === "radar" ? true : undefined}>
      <summary>Changes against the baseline</summary>
      {change?.agentTrailer ? (
        <p className={s.note}>
          <span className={`${s.tag} ${s.tagAgent}`}>agent trailer</span> A commit touching this
          part names {change.agentTrailer}. That is a hint from commit metadata, not proof of who
          wrote it.
        </p>
      ) : null}
      <ul>
        {dependencies.map((d) => (
          <li className={s.evidenceRow} key={`${d.manifest}|${d.name}`}>
            <span className={s.mono}>{d.name}</span>
            <span className={s.rowMeta}>
              {d.from ?? "not present"} to {d.to ?? "removed"} · {d.local ? "local" : "committed"} ·{" "}
              {d.manifest}
            </span>
          </li>
        ))}
        {inside.map((f) => (
          <li className={s.evidenceRow} key={`${f.repo}|${f.path}|${f.stage}`}>
            <span className={s.mono}>{f.path}</span>
            <span className={s.rowMeta}>
              {f.status} · {f.stage}
              {f.previousPath ? ` · was ${f.previousPath}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function PartDetails({ index, part }: { index: GraphIndex; part: Part }) {
  const { open, reveal, select, setScope } = useStore.getState();
  const scope = useStore((state) => state.scope);
  const [showEvidence, setShowEvidence] = useState(false);
  const diagnostics = index.diagnostics.get(part.id) ?? [];
  const flows = index.graph.flows.filter((flow) =>
    flow.steps.some((step) => step.from === part.id || step.to === part.id),
  );
  const parent = part.parent ? index.parts.get(part.parent) : null;
  const repos = part.repos.map(
    (id) => index.graph.repos.find((repo) => repo.id === id)?.name ?? id,
  );
  const hasDetails =
    part.about || part.owner || part.resource || part.topics.length > 0 || part.rules.length > 0;

  return (
    <>
      <div className={s.inspectorHead}>
        <h3 className={p.inspectorName}>{part.name}</h3>
        <button
          type="button"
          className={s.iconButton}
          aria-label="Close the inspector"
          onClick={() => select(null)}
        >
          <Close />
        </button>
      </div>
      <div className={p.identity}>
        <span className={p.kind}>
          {part.resource
            ? "Azure resource"
            : part.kind === "unknown"
              ? "Unresolved part"
              : part.kind}
        </span>
        {repos.map((repo) => (
          <span key={repo} className={p.repoBadge}>
            {repo}
          </span>
        ))}
      </div>
      {part.does ? <p className={p.purpose}>{part.does}</p> : null}
      {part.tech ? <p className={p.technology}>{part.tech}</p> : null}
      {part.resource ? <p className={`${p.technology} ${s.mono}`}>{part.resource.type}</p> : null}
      <div className={p.inspectorActions}>
        {part.hasInside && scope !== part.id ? (
          <button type="button" className={p.primaryButton} onClick={() => open(part.id)}>
            Open inside
          </button>
        ) : null}
        {part.parent !== scope && scope !== part.id ? (
          <button type="button" className={s.button} onClick={() => reveal(part.id)}>
            Show on the map
          </button>
        ) : null}
        {scope === part.id ? (
          <button
            type="button"
            className={s.button}
            onClick={() => {
              setScope(part.parent);
              select({ type: "part", id: part.id });
            }}
          >
            Back to {parent?.name ?? "platform"}
          </button>
        ) : null}
      </div>

      {diagnostics.length > 0 ? (
        <div className={p.issues}>
          {diagnostics.map((diagnostic) => (
            <p className={s.problem} key={`${diagnostic.code}|${diagnostic.message}`}>
              {diagnostic.severity === "error" ? <FailMark /> : <WarnMark />}
              <span>{diagnostic.message}</span>
            </p>
          ))}
        </div>
      ) : null}
      {part.reuse.length > 0 ? (
        <section className={p.reuseSection} aria-label="Reuse this capability">
          <h3>Already available here</h3>
          {part.reuse.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </section>
      ) : null}

      <h3 className={s.sectionTitle}>Connected to</h3>
      <ConnectionRows index={index} part={part} />
      {flows.length > 0 ? (
        <>
          <h3 className={s.sectionTitle}>Flows through this part</h3>
          <ul>
            {flows.map((flow) => (
              <li key={flow.id}>
                <button
                  type="button"
                  className={p.flowLink}
                  onClick={() => {
                    const { setEye, setFlow, goToStep, setPlaying } = useStore.getState();
                    setEye("tracer");
                    setFlow(flow.id);
                    goToStep(
                      flow.steps.findIndex((step) => step.from === part.id || step.to === part.id),
                    );
                    setPlaying(!motion.reduced);
                  }}
                >
                  <Play />
                  <span>{flow.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <PartChanges index={index} part={part} />
      {part.dependencies.length > 0 ? (
        <details className={p.detail}>
          <summary>
            Dependencies <span>{part.dependencies.length}</span>
          </summary>
          <ul>
            {part.dependencies.map((dependency) => (
              <li className={s.evidenceRow} key={`${dependency.manifest}|${dependency.name}`}>
                <span className={s.mono}>
                  {dependency.name} {dependency.version ?? ""}
                </span>
                <span className={s.rowMeta}>
                  {dependency.repo}:{dependency.manifest}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {hasDetails ? (
        <details className={p.detail}>
          <summary>More about this part</summary>
          {part.about && part.about !== part.does ? (
            <p className={p.description}>{part.about}</p>
          ) : null}
          <dl className={s.factGrid}>
            {part.owner ? (
              <>
                <dt>Owner</dt>
                <dd>{part.owner}</dd>
              </>
            ) : null}
            {part.resource ? (
              <>
                <dt>Resource identity</dt>
                <dd className={s.mono}>{part.resource.identifier}</dd>
              </>
            ) : null}
            {part.topics.length > 0 ? (
              <>
                <dt>Topics</dt>
                <dd>{part.topics.join(", ")}</dd>
              </>
            ) : null}
          </dl>
          {part.rules.length > 0 ? (
            <>
              <h3 className={s.sectionTitle}>Rules</h3>
              <ul>
                {part.rules.map((rule) => (
                  <li key={rule} className={s.evidenceRow}>
                    {rule}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </details>
      ) : null}
      <details
        className={p.detail}
        open={showEvidence}
        onToggle={(event) => setShowEvidence(event.currentTarget.open)}
      >
        <summary>
          Sources &amp; evidence <span>{part.evidence.length}</span>
        </summary>
        <div className={s.tags}>
          <ProvenanceTag value={part.provenance} />
        </div>
        {showEvidence ? <EvidenceList items={part.evidence} /> : null}
        {showEvidence && part.code.length > 0 ? (
          <>
            <h3 className={s.sectionTitle}>Code locations</h3>
            <ul>
              {part.code.map((code) => (
                <li className={s.evidenceRow} key={`${code.repo}|${code.glob}`}>
                  <span className={s.mono}>
                    {code.repo}:{code.glob}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </details>
    </>
  );
}
function ConnectionDetails({ index, connection }: { index: GraphIndex; connection: Connection }) {
  const { open } = useStore.getState();
  return (
    <div style={{ marginBottom: 14 }}>
      <p className={s.body}>
        <button
          type="button"
          className={s.crumb}
          style={{ padding: 0, color: "inherit" }}
          onClick={() => open(connection.from)}
        >
          {nameOf(index, connection.from)}
        </button>{" "}
        <span className={s.verb}>{connection.verb}</span>{" "}
        <button
          type="button"
          className={s.crumb}
          style={{ padding: 0, color: "inherit" }}
          onClick={() => open(connection.to)}
        >
          {nameOf(index, connection.to)}
        </button>
      </p>
      {connection.via ? <p className={s.mono}>{connection.via}</p> : null}
      <div className={s.tags}>
        {connection.crossRepo ? <span className={s.tag}>across repositories</span> : null}
        {connection.resolution === "unknown" ? (
          <span className={`${s.tag} ${s.tagWarn}`}>unknown</span>
        ) : null}
      </div>
      {connection.reason ? (
        <p className={s.problem}>
          <WarnMark />
          <span>{connection.reason}</span>
        </p>
      ) : null}
      <details className={p.detail}>
        <summary>Sources &amp; evidence</summary>
        <div className={s.tags}>
          <ProvenanceTag value={connection.provenance} />
        </div>
        <EvidenceList items={connection.evidence} />
      </details>
    </div>
  );
}

export function Inspector() {
  const index = useStore((state) => state.index);
  const selection = useStore((state) => state.selection);
  const { select } = useStore.getState();
  if (!index || !selection) return null;

  if (selection.type === "part") {
    const part = index.parts.get(selection.id);
    if (!part) return null;
    // Keyed so a new selection starts at the top with its file list closed.
    return (
      <Frame title="Inspector" grow>
        <PartDetails key={part.id} index={index} part={part} />
      </Frame>
    );
  }

  if (selection.type === "removed") {
    const removed = index.graph.comparison.removedParts.find((p) => p.id === selection.id);
    if (!removed) return null;
    const baseline = index.graph.comparison.repos.find((r) => r.repo === removed.repo)?.baseline;
    return (
      <Frame title="Inspector" grow>
        <div className={s.inspectorHead}>
          <h3 className={s.inspectorName}>{removed.name}</h3>
          <button
            type="button"
            className={s.iconButton}
            aria-label="Close the inspector"
            onClick={() => select(null)}
          >
            <Close />
          </button>
        </div>
        <div className={s.tags}>
          <span className={s.tag}>removed</span>
          <span className={s.tag}>{removed.kind}</span>
          <span className={s.tag}>{removed.repo}</span>
        </div>
        <p className={s.body}>{removed.does}</p>
        <p className={s.note} style={{ marginTop: 8 }}>
          Declared at {baseline?.ref ?? "the baseline"} ({shortSha(baseline?.sha)}) and absent from
          the current knowledge. It is listed here so a removal stays inspectable; it has no place
          on the current map.
        </p>
      </Frame>
    );
  }

  const connections = selection.connections
    .map((id) => index.connections.get(id))
    .filter((c): c is Connection => c !== undefined);
  return (
    <Frame title={connections.length > 1 ? `${connections.length} connections` : "Connection"} grow>
      <div className={s.inspectorHead}>
        <h3 className={s.inspectorName}>
          {connections.length > 1 ? "Grouped connections" : "Connection"}
        </h3>
        <button
          type="button"
          className={s.iconButton}
          aria-label="Close the inspector"
          onClick={() => select(null)}
        >
          <Close />
        </button>
      </div>
      {connections.map((connection) => (
        <ConnectionDetails key={connection.id} index={index} connection={connection} />
      ))}
    </Frame>
  );
}
