// Named investigations: drafts live in IndexedDB; reviewed trails enter committed knowledge through
// `archeion import-trail`. Losing this cache cannot damage knowledge or fake an unchanged result.
import { TRAIL_VERSION, type Trail, type TrailStep } from "@archeion/core/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cacheAll, cacheDelete, cachePut } from "../data/idb";
import { search } from "../logic/search";
import { captureTargets, compareTrail } from "../logic/trails";
import { useStore } from "../store";
import { Frame, WarnMark } from "./shared";
import s from "./ui.module.css";

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "investigation";

const STATUS_LABEL = {
  unchanged: "unchanged",
  changed: "changed",
  removed: "removed",
  unavailable: "unavailable",
};

function restore(step: TrailStep) {
  const { index, setEye, setScope, select, setFlow, goToStep, setSonar, setLeft } =
    useStore.getState();
  if (!index) return;
  setEye(step.eye);
  setLeft("trails");
  setScope(step.scope && index.parts.has(step.scope) ? step.scope : null);
  if (step.flow && index.graph.flows.some((f) => f.id === step.flow)) {
    setFlow(step.flow);
    if (step.flowStep !== null) goToStep(step.flowStep);
  }
  if (step.query !== null) {
    setSonar(
      step.query as string,
      search(index, step.query as string).map((r) => r.part),
      false,
    );
  }
  select(
    step.selected && index.parts.has(step.selected) ? { type: "part", id: step.selected } : null,
  );
}

function download(trail: Trail) {
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(trail, null, 2)}\n`], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${trail.id}.trail.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function Report({ trail }: { trail: Trail }) {
  const index = useStore((state) => state.index);
  const report = useMemo(() => (index ? compareTrail(trail, index) : null), [index, trail]);
  if (!report) return null;
  const moved = report.targets.filter((t) => t.status !== "unchanged");
  return (
    <>
      <h3 className={s.sectionTitle}>Since this was saved</h3>
      {report.repos.length === 0 && report.targets.length === 0 ? (
        <p className={s.note}>Nothing was captured to compare yet.</p>
      ) : null}
      <ul>
        {report.repos.map((repo) => (
          <li className={s.evidenceRow} key={repo.repo}>
            <span className={s.rowTitle}>
              <span>{repo.repo}</span>
              <span className={s.tag}>
                {repo.status === "same"
                  ? "same state"
                  : repo.status === "unavailable"
                    ? "unavailable"
                    : repo.sameCommit
                      ? "local work differs"
                      : "different commit"}
              </span>
            </span>
          </li>
        ))}
        {report.targets.map((target) => (
          <li className={s.evidenceRow} key={target.part}>
            <button
              type="button"
              className={s.row}
              style={{ padding: 0 }}
              onClick={() => useStore.getState().open(target.part)}
            >
              <span className={s.rowTitle}>
                <span>{target.name}</span>
                <span
                  className={`${s.tag} ${target.status === "changed" || target.status === "removed" ? s.tagStrong : ""}`}
                >
                  {STATUS_LABEL[target.status]}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {moved.length === 0 && report.targets.length > 0 ? (
        <p className={s.note}>Every part in this investigation matches what was saved.</p>
      ) : null}
    </>
  );
}

export function TrailPanel() {
  const index = useStore((state) => state.index);
  const digest = useStore((state) => state.digest);
  const active = useStore((state) => state.activeTrail);
  const { setActiveTrail, announce } = useStore.getState();
  const [drafts, setDrafts] = useState<Trail[]>([]);
  const [cacheFailed, setCacheFailed] = useState(false);
  const [note, setNote] = useState("");

  const reload = useCallback(async () => {
    const all = await cacheAll<Trail>("trails");
    setCacheFailed(all === null);
    setDrafts((all ?? []).sort((a, b) => (a.title < b.title ? -1 : 1)));
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (trail: Trail) => {
      setActiveTrail(trail);
      const saved = await cachePut("trails", trail.id, trail);
      setCacheFailed(!saved);
      await reload();
    },
    [setActiveTrail, reload],
  );

  if (!index) return null;
  const committed = index.graph.trails;

  const start = () => {
    const title = "Untitled investigation";
    let id = slug(title);
    for (let n = 2; drafts.some((d) => d.id === id) || committed.some((t) => t.id === id); n++)
      id = `${slug(title)}-${n}`;
    void save({
      version: TRAIL_VERSION,
      id,
      title,
      question: "",
      finding: null,
      author: null,
      snapshot: {
        graphDigest: digest,
        repos: index.graph.repos
          .filter((r) => r.git)
          .map((r) => ({ repo: r.id, head: r.head, stateId: r.stateId })),
      },
      steps: [],
    });
  };

  const capture = () => {
    if (!active) return;
    const state = useStore.getState();
    const flow = index.graph.flows.find((f) => f.id === state.flowId);
    const hop = state.flowStep !== null ? flow?.steps[state.flowStep] : undefined;
    const selected = state.selection?.type === "part" ? state.selection.id : null;
    const step: TrailStep = {
      eye: state.eye,
      scope: state.scope,
      selected,
      flow: state.eye === "tracer" ? state.flowId : null,
      flowStep: state.eye === "tracer" ? state.flowStep : null,
      query: state.eye === "sonar" ? state.query : null,
      note: note.trim(),
      targets: captureTargets(
        index,
        selected,
        state.scope,
        hop ? [hop.from, hop.to].filter((id) => index.parts.has(id)) : [],
      ),
    };
    setNote("");
    announce("View added to the investigation");
    // Refreshes the snapshot: the trail describes the state its latest view was taken from.
    void save({
      ...active,
      steps: [...active.steps, step],
      snapshot: {
        graphDigest: digest,
        repos: index.graph.repos
          .filter((r) => r.git)
          .map((r) => ({ repo: r.id, head: r.head, stateId: r.stateId })),
      },
    });
  };

  if (!active) {
    return (
      <Frame title="Saved investigations" grow>
        <button type="button" className={s.button} onClick={start}>
          New investigation
        </button>
        {cacheFailed ? (
          <p className={s.problem} style={{ marginTop: 8 }}>
            <WarnMark />
            <span>
              Browser storage is unavailable, so drafts last only until this tab closes. Export to
              keep one.
            </span>
          </p>
        ) : null}
        <h3 className={s.sectionTitle}>Drafts in this browser</h3>
        {drafts.length === 0 ? (
          <p className={s.note}>
            An investigation records a question, notes, and a sequence of map views.
          </p>
        ) : (
          <ul>
            {drafts.map((trail) => (
              <li key={trail.id}>
                <button type="button" className={s.row} onClick={() => setActiveTrail(trail)}>
                  <span className={s.rowTitle}>
                    <span>{trail.title}</span>
                    <span className={`${s.mono} ${s.dim}`}>{trail.steps.length}</span>
                  </span>
                  {trail.question ? <span className={s.rowMeta}>{trail.question}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <h3 className={s.sectionTitle}>Committed trails</h3>
        {committed.length === 0 ? (
          <p className={s.note}>
            Export a draft, run <code>archeion import-trail</code>, and review the Markdown it
            writes. Later builds list it here.
          </p>
        ) : (
          <ul>
            {committed.map((trail) => (
              <li key={trail.id}>
                <button type="button" className={s.row} onClick={() => setActiveTrail(trail)}>
                  <span className={s.rowTitle}>
                    <span>{trail.title}</span>
                    <span className={`${s.mono} ${s.dim}`}>{trail.steps.length}</span>
                  </span>
                  {trail.question ? <span className={s.rowMeta}>{trail.question}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Frame>
    );
  }

  // By identity: an exported draft and its committed trail share an id but are not the same thing.
  const isCommitted = committed.includes(active);

  return (
    <Frame title={isCommitted ? "Committed trail" : "Investigation"} grow>
      <button type="button" className={s.button} onClick={() => setActiveTrail(null)}>
        All investigations
      </button>
      {isCommitted ? (
        <>
          <h3 className={s.inspectorName} style={{ marginTop: 10 }}>
            {active.title}
          </h3>
          {active.question ? <p className={s.body}>{active.question}</p> : null}
          {active.finding ? (
            <p className={s.note} style={{ marginTop: 4 }}>
              Finding: {active.finding}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <label className={s.fieldLabel} htmlFor="trail-title">
            Name
          </label>
          <input
            id="trail-title"
            className={s.input}
            value={active.title}
            onChange={(event) => setActiveTrail({ ...active, title: event.target.value })}
            onBlur={() => void save(active)}
          />
          <label className={s.fieldLabel} htmlFor="trail-question">
            Question
          </label>
          <textarea
            id="trail-question"
            className={s.textarea}
            placeholder="What are you trying to find out?"
            value={active.question}
            onChange={(event) => setActiveTrail({ ...active, question: event.target.value })}
            onBlur={() => void save(active)}
          />
          <label className={s.fieldLabel} htmlFor="trail-note">
            Note for this view
          </label>
          <textarea
            id="trail-note"
            className={s.textarea}
            placeholder="What does this view show?"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className={s.buttonRow}>
            <button type="button" className={s.button} onClick={capture}>
              Add this view
            </button>
            <button
              type="button"
              className={s.button}
              disabled={active.steps.length === 0}
              onClick={() => download({ ...active, id: slug(active.title) })}
            >
              Export JSON
            </button>
            <button
              type="button"
              className={s.button}
              onClick={() => {
                void cacheDelete("trails", active.id).then(() => {
                  setActiveTrail(null);
                  return reload();
                });
              }}
            >
              Discard draft
            </button>
          </div>
          {cacheFailed ? (
            <p className={s.problem} style={{ marginTop: 8 }}>
              <WarnMark />
              <span>Browser storage is unavailable. Export this draft to keep it.</span>
            </p>
          ) : null}
        </>
      )}

      <h3 className={s.sectionTitle}>Views</h3>
      {active.steps.length === 0 ? (
        <p className={s.note}>Move around the map, then add the view you want to keep.</p>
      ) : (
        <ol>
          {active.steps.map((step, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: views are an ordered list with no id.
            <li key={i}>
              <button type="button" className={s.row} onClick={() => restore(step)}>
                <span className={s.rowTitle}>
                  <span>
                    {step.selected
                      ? (index.parts.get(step.selected)?.name ?? step.selected)
                      : step.scope
                        ? (index.parts.get(step.scope)?.name ?? step.scope)
                        : index.graph.workspace.name}
                  </span>
                  <span className={s.tag}>{step.eye}</span>
                </span>
                {step.note ? <span className={s.rowMeta}>{step.note}</span> : null}
              </button>
            </li>
          ))}
        </ol>
      )}
      <Report trail={active} />
    </Frame>
  );
}
