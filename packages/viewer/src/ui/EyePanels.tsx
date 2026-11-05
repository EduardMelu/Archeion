import { useEffect, useMemo, useRef, useState } from "react";
import { requestRebuild } from "../data/load";
import { pathTo } from "../logic/graphIndex";
import { type BrowseCategory, browse } from "../logic/search";
import { motion } from "../scene/motion";
import { useStore } from "../store";
import { Close, Pause, Play, Restart } from "./icons";
import p from "./Panels.module.css";
import { Frame, shortSha, WarnMark } from "./shared";
import s from "./ui.module.css";

// ---------------------------------------------------------------- Tracer

/** Keeps the playing step in view without moving focus, so a keyboard user stays where they are. */
function FollowCurrentStep({ step }: { step: number | null }) {
  const marker = useRef<HTMLSpanElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the step changes.
  useEffect(() => {
    const list = marker.current?.parentElement;
    list
      ?.querySelector('ol [aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [step]);
  return <span ref={marker} hidden />;
}

export function TracerPanel() {
  const index = useStore((state) => state.index);
  const flowId = useStore((state) => state.flowId);
  const flowStep = useStore((state) => state.flowStep);
  const playing = useStore((state) => state.playing);
  const { setFlow, goToStep, setPlaying } = useStore.getState();
  if (!index) return null;
  const flows = index.graph.flows;
  const flow = flows.find((f) => f.id === flowId);
  const destination = flow?.steps.at(-1);
  const name = (id: string) => index.parts.get(id)?.name ?? id;

  return (
    <Frame title="Flow routes" grow>
      <FollowCurrentStep step={flowStep} />
      {flow ? (
        <div className={p.routeFocus}>
          <button type="button" className={p.textButton} onClick={() => setFlow(null)}>
            All flows
          </button>
          <h3 className={p.panelName}>{flow.name}</h3>
          {flow.does ? <p className={p.description}>{flow.does}</p> : null}
          <div className={p.routeEnds}>
            <span>{flow.steps[0] ? name(flow.steps[0].from) : "No start"}</span>
            <span className={p.routeLine} aria-hidden="true" />
            <span>{destination ? name(destination.to) : "No end"}</span>
          </div>
          {flow.steps.some((step) => step.gap) ? (
            <span className={s.problem} style={{ padding: 0 }}>
              <WarnMark />
              <span>
                {flow.steps.filter((step) => step.gap).length === 1
                  ? "1 unresolved step"
                  : `${flow.steps.filter((step) => step.gap).length} unresolved steps`}
              </span>
            </span>
          ) : null}
          <div className={p.playback}>
            <button
              type="button"
              className={p.primaryButton}
              disabled={flow.steps.length === 0}
              onClick={() => {
                if (!playing && (flowStep === null || flowStep === flow.steps.length - 1))
                  goToStep(0);
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause /> : <Play />}
              {playing ? "Pause flow" : "Play flow"}
            </button>
            <button
              type="button"
              className={s.iconButton}
              aria-label="Restart flow"
              disabled={flow.steps.length === 0}
              onClick={() => {
                goToStep(0);
                setPlaying(!motion.reduced);
              }}
            >
              <Restart />
            </button>
            <span className={p.stepCount}>
              {flowStep === null ? "Ready" : `${flowStep + 1} / ${flow.steps.length}`}
            </span>
          </div>
        </div>
      ) : flows.length === 0 ? (
        <p className={p.empty}>
          This graph has no prepared routes yet. Connections remain available on the map.
        </p>
      ) : (
        <>
          <p className={p.intro}>Choose a journey. Follow data as it moves through the system.</p>
          <ul className={p.routeList}>
            {flows.map((item) => {
              const gaps = item.steps.filter((step) => step.gap).length;
              const destination = item.steps.at(-1);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={p.routeCard}
                    aria-current={item.id === flowId ? "true" : undefined}
                    onClick={() => {
                      setFlow(item.id);
                      goToStep(0);
                      setPlaying(!motion.reduced);
                    }}
                  >
                    <span className={s.rowTitle}>
                      <span>{item.name}</span>
                      <Play />
                    </span>
                    {item.does ? <span className={s.rowMeta}>{item.does}</span> : null}
                    <span className={p.routePreview}>
                      <span>{item.steps[0] ? name(item.steps[0].from) : "No start"}</span>
                      <span className={p.routeLine} aria-hidden="true" />
                      <span>{destination ? name(destination.to) : "No end"}</span>
                    </span>
                    <span className={p.routeMeta}>{item.steps.length} steps</span>
                    {gaps > 0 ? (
                      <span className={s.problem}>
                        <WarnMark />
                        <span>{gaps === 1 ? "1 unresolved step" : `${gaps} unresolved steps`}</span>
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {flow ? (
        <>
          <h3 className={s.sectionTitle}>Journey</h3>
          <ol className={p.timeline}>
            {flow.steps.map((step, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a flow can repeat a hop; order is its identity.
              <li key={`${step.from}|${step.to}|${i}`}>
                <button
                  type="button"
                  className={p.step}
                  aria-current={i === flowStep ? "true" : undefined}
                  onClick={() => {
                    setPlaying(false);
                    goToStep(i);
                  }}
                >
                  <span className={p.stepNumber}>{i + 1}</span>
                  <span className={p.stepCopy}>
                    <span className={p.stepName}>
                      {step.caption || `${name(step.from)} ${step.verb} ${name(step.to)}`}
                    </span>
                    {step.gap ? (
                      <span className={s.problem}>
                        <WarnMark />
                        <span>{step.gap}</span>
                      </span>
                    ) : (
                      <span className={s.rowMeta}>
                        {index.parts.get(step.from)?.name} {step.verb}{" "}
                        {index.parts.get(step.to)?.name}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className={p.footnote}>Prepared architecture flow · not live traffic</p>
        </>
      ) : null}
    </Frame>
  );
}

// ---------------------------------------------------------------- Radar

function Baselines() {
  const index = useStore((state) => state.index);
  const canRebuild = useStore((state) => state.buildInfo?.canRebuild ?? false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!index) return null;
  const { repos } = index.graph.comparison;

  const apply = async (repo: string) => {
    const ref = draft[repo]?.trim();
    if (!ref) return;
    setBusy(true);
    setError(null);
    try {
      await requestRebuild({ [repo]: ref });
      setDraft((current) => ({ ...current, [repo]: "" }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h3 className={s.sectionTitle}>Compared with</h3>
      <ul>
        {repos.map((row) => (
          <li className={s.evidenceRow} key={row.repo}>
            <span className={s.rowTitle}>
              <span>{row.repo}</span>
              {row.baseline ? (
                <span className={`${s.mono} ${s.dim}`}>{shortSha(row.baseline.sha)}</span>
              ) : null}
            </span>
            {row.status === "available" && row.baseline ? (
              <span className={s.rowMeta}>
                {row.baseline.kind === "merge-base"
                  ? `Where this branch split from ${row.baseline.ref}`
                  : row.baseline.kind === "head"
                    ? `On ${row.defaultBranch ?? "the default branch"}: local edits only`
                    : `Chosen reference ${row.baseline.ref}`}
              </span>
            ) : (
              <span className={s.problem}>
                <WarnMark />
                <span>{row.reason}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {error ? (
        <p className={s.problem}>
          <WarnMark />
          <span>{error}</span>
        </p>
      ) : null}
      {canRebuild ? (
        <details>
          <summary>Compare with another reference</summary>
          <p className={s.note}>On a default branch, an earlier reference includes its commits.</p>
          {repos.map((row) => (
            <form
              key={row.repo}
              className={s.inline}
              onSubmit={(event) => {
                event.preventDefault();
                void apply(row.repo);
              }}
            >
              <input
                className={s.input}
                aria-label={`Another Git reference for ${row.repo}`}
                placeholder={row.repo}
                value={draft[row.repo] ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [row.repo]: event.target.value }))
                }
              />
              <button
                type="submit"
                className={s.button}
                disabled={busy || !draft[row.repo]?.trim()}
              >
                Compare
              </button>
            </form>
          ))}
        </details>
      ) : (
        <p className={s.note}>
          To compare with another reference, run{" "}
          <code>archeion view --base &lt;repo&gt;=&lt;ref&gt;</code>
        </p>
      )}
    </>
  );
}

export function RadarPanel() {
  const index = useStore((state) => state.index);
  const selection = useStore((state) => state.selection);
  const { open, select } = useStore.getState();
  if (!index) return null;
  const { repos, parts, dependencies, files, commits, removedParts } = index.graph.comparison;
  const compared = repos.filter((repo) => repo.status === "available");
  const unavailable = repos.filter((repo) => repo.status === "unavailable");
  const hasComparison = compared.length > 0;
  const partial = hasComparison && unavailable.length > 0;
  const unmapped = files.filter((f) => f.parts.length === 0 && !f.path.startsWith(".archeion/"));
  const selectedId =
    selection?.type === "part" || selection?.type === "removed" ? selection.id : null;
  const live = parts.filter((p) => index.parts.has(p.part));

  return (
    <Frame title="Changes" grow>
      <p className={p.intro}>
        See what shifted across the platform, including libraries and local edits.
      </p>
      {!hasComparison || partial ? (
        <div className={p.comparisonState} role="status">
          <h3>{partial ? "Partial change comparison" : "Change comparison unavailable"}</h3>
          <p>
            {partial
              ? `Compared ${compared.length} of ${repos.length} repositories. Counts cover those repositories only.`
              : "No repository could be compared with a Git baseline. Changes are unknown; the architecture is still available."}
          </p>
          {unavailable.length > 0 ? (
            <ul>
              {unavailable.map((repo) => (
                <li key={repo.repo}>
                  <strong>
                    {index.graph.repos.find((item) => item.id === repo.repo)?.name ?? repo.repo}
                  </strong>
                  {repo.reason ? `: ${repo.reason}` : ": baseline unavailable"}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {hasComparison ? (
        <p className={p.changeSummary}>
          <span>{parts.length + removedParts.length} changed parts</span>
          <span>{dependencies.length} dependency changes</span>
        </p>
      ) : null}

      {hasComparison ? <h3 className={s.sectionTitle}>Changed parts</h3> : null}
      {!hasComparison ? null : parts.length + removedParts.length === 0 ? (
        <p className={s.note}>No documented part changed in the compared repositories.</p>
      ) : (
        <ul>
          {live.map((change) => (
            <li key={change.part}>
              <button
                type="button"
                className={s.row}
                aria-current={selectedId === change.part ? "true" : undefined}
                onClick={() => open(change.part)}
              >
                <span className={s.rowTitle}>
                  <span>{index.parts.get(change.part)?.name}</span>
                  <span className={s.tags} style={{ margin: 0 }}>
                    {change.status === "added" ? (
                      <span className={`${s.tag} ${s.tagStrong}`}>new</span>
                    ) : null}
                    {change.committed ? <span className={s.tag}>committed</span> : null}
                    {change.local ? <span className={`${s.tag} ${s.tagStrong}`}>local</span> : null}
                    {change.agentTrailer ? (
                      <span className={`${s.tag} ${s.tagAgent}`}>agent trailer</span>
                    ) : null}
                  </span>
                </span>
                <span className={s.rowMeta}>
                  {pathTo(index, change.part)
                    .slice(0, -1)
                    .map((id) => index.parts.get(id)?.name)
                    .join(" / ")}
                </span>
              </button>
            </li>
          ))}
          {removedParts.map((removed) => (
            <li key={removed.id}>
              <button
                type="button"
                className={s.row}
                aria-current={selectedId === removed.id ? "true" : undefined}
                onClick={() => select({ type: "removed", id: removed.id })}
              >
                <span className={s.rowTitle}>
                  <span>{removed.name}</span>
                  <span className={s.tag}>removed</span>
                </span>
                <span className={s.rowMeta}>{removed.repo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {dependencies.length > 0 ? (
        <>
          <h3 className={s.sectionTitle}>Dependency changes</h3>
          <ul>
            {dependencies.map((d) => (
              <li className={s.evidenceRow} key={`${d.repo}|${d.manifest}|${d.name}`}>
                <span className={s.rowTitle}>
                  <span className={s.mono}>{d.name}</span>
                  {d.local ? (
                    <span className={`${s.tag} ${s.tagStrong}`}>local</span>
                  ) : (
                    <span className={s.tag}>committed</span>
                  )}
                </span>
                <span className={s.rowMeta}>
                  {d.from === null
                    ? `added at ${d.to}`
                    : d.to === null
                      ? `removed, was ${d.from}`
                      : `${d.from} to ${d.to}`}{" "}
                  · {d.repo}:{d.manifest}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {unmapped.length > 0 ? (
        <>
          <h3 className={s.sectionTitle}>Changes no part covers</h3>
          <ul>
            {unmapped.map((f) => (
              <li className={s.evidenceRow} key={`${f.repo}|${f.path}|${f.stage}`}>
                <span className={s.mono}>
                  {f.repo}:{f.path}
                </span>
                <span className={s.rowMeta}>
                  {f.status} · {f.stage}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {commits.length > 0 ? (
        <details>
          <summary>{commits.length === 1 ? "1 commit" : `${commits.length} commits`}</summary>
          <ul>
            {commits.map((c) => (
              <li className={s.evidenceRow} key={`${c.repo}|${c.sha}`}>
                <span className={s.rowTitle}>
                  <span>{c.subject}</span>
                  <span className={`${s.mono} ${s.dim}`}>{shortSha(c.sha)}</span>
                </span>
                <span className={s.rowMeta}>
                  {c.author} · {c.repo}
                  {c.agentTrailer ? ` · trailer names ${c.agentTrailer}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {hasComparison ? (
        <p className={s.note} style={{ marginTop: 10 }}>
          Captured when the graph was built. Connected parts are context to inspect, not proven
          impact.
        </p>
      ) : null}
      <details className={p.detail}>
        <summary>Comparison details</summary>
        <Baselines />
      </details>
    </Frame>
  );
}

// ---------------------------------------------------------------- Sonar

export function SonarPanel() {
  const index = useStore((state) => state.index);
  const query = useStore((state) => state.query);
  const selection = useStore((state) => state.selection);
  const { setSonar, open } = useStore.getState();
  const input = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<BrowseCategory>("all");
  const [topic, setTopic] = useState<string | null>(null);
  const [repo, setRepo] = useState<string | null>(null);
  const results = useMemo(
    () => (index ? browse(index, query, { category, topic, repo }) : []),
    [index, query, category, topic, repo],
  );
  useEffect(() => {
    setSonar(
      query,
      category === "all" && !topic && !repo && !query.trim() ? [] : results.map((part) => part.id),
      false,
    );
  }, [query, results, category, topic, repo, setSonar]);

  if (!index) return null;
  const selected = selection?.type === "part" ? selection.id : null;
  const topics = [...new Set(index.graph.parts.flatMap((part) => part.topics))].sort();
  const categories: [BrowseCategory, string][] = [
    ["all", "All"],
    ["reusable", "Reusable"],
    ["services", "Services"],
    ["resources", "Resources"],
  ];
  const reset = () => {
    setCategory("all");
    setTopic(null);
    setRepo(null);
    setSonar("", [], false);
  };

  return (
    <Frame title="Capability catalog" grow>
      <p className={p.intro}>Explore what already exists before building something new.</p>
      <div className={p.chips} role="group" aria-label="Capability categories">
        {categories.map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={p.chip}
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {topics.length > 0 || index.graph.repos.length > 1 ? (
        <details className={p.catalogFilters}>
          <summary>Filter by repository or topic{topic || repo ? " · active" : ""}</summary>
          {topics.length > 0 ? (
            <div className={p.filterGroup}>
              <h3 className={p.filterLabel}>Topics</h3>
              <div className={p.chips} role="group" aria-label="Topics">
                {topics.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={p.chip}
                    aria-pressed={topic === value}
                    onClick={() => setTopic(topic === value ? null : value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {index.graph.repos.length > 1 ? (
            <div className={p.filterGroup}>
              <h3 className={p.filterLabel}>Repositories</h3>
              <div className={p.chips} role="group" aria-label="Repositories">
                {index.graph.repos.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={p.chip}
                    aria-pressed={repo === item.id}
                    onClick={() => setRepo(repo === item.id ? null : item.id)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </details>
      ) : null}
      <search className={p.catalogSearch}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSonar(
              query,
              results.map((part) => part.id),
              true,
            );
          }}
        >
          <label className="visually-hidden" htmlFor="sonar-query">
            Filter by keyword
          </label>
          <div className={s.searchField}>
            <input
              ref={input}
              id="sonar-query"
              type="search"
              className={s.input}
              placeholder="Filter catalog by keyword…"
              value={query}
              onChange={(event) => {
                const value = event.target.value;
                setSonar(
                  value,
                  browse(index, value, { category, topic, repo }).map((part) => part.id),
                  false,
                );
              }}
            />
            {query ? (
              <button
                type="button"
                className={`${s.iconButton} ${s.searchClear}`}
                aria-label="Clear the search"
                onClick={() => {
                  setSonar("", [], false);
                  input.current?.focus();
                }}
              >
                <Close />
              </button>
            ) : null}
          </div>
        </form>
      </search>
      {results.length === 0 ? (
        <div className={p.empty}>
          <p>No documented part matches these filters. Try a broader view.</p>
          <button type="button" className={p.textButton} onClick={reset}>
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <h3 className={s.sectionTitle} aria-live="polite">
            {results.length === 1 ? "1 part" : `${results.length} parts`}
          </h3>
          <ul>
            {results.map((part) => {
              const within = pathTo(index, part.id)
                .slice(0, -1)
                .map((id) => index.parts.get(id)?.name);
              return (
                <li key={part.id}>
                  <button
                    type="button"
                    className={p.capability}
                    aria-current={selected === part.id ? "true" : undefined}
                    onClick={() => open(part.id)}
                  >
                    <span className={s.rowTitle}>
                      <span>{part.name}</span>
                      <span className={p.kind}>{part.kind}</span>
                    </span>
                    {part.does ? <span className={s.rowMeta}>{part.does}</span> : null}
                    {part.reuse[0] ? <span className={p.reuseCue}>{part.reuse[0]}</span> : null}
                    <span className={p.location}>
                      {within.length > 0 ? within.join(" / ") : part.repos.join(" / ")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <details className={p.detail}>
        <summary>How discovery works</summary>
        <p className={p.footnote}>
          Categories use declared part types and reuse notes. Keywords match words in names,
          purpose, topics, technology, and repository names. All query words must appear; no regex
          or AI calls.
        </p>
      </details>
    </Frame>
  );
}
