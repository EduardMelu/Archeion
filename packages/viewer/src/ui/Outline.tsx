// The map's non-visual counterpart: every part is reachable as a real, focusable button, with the
// same summaries the canvas draws. It is also how a keyboard moves through the architecture.
import { useMemo } from "react";
import { type PartVisual, partVisuals } from "../logic/emphasis";
import type { GraphIndex } from "../logic/graphIndex";
import { pathTo } from "../logic/graphIndex";
import { useStore } from "../store";
import { Minus, Plus } from "./icons";
import { Frame } from "./shared";
import s from "./ui.module.css";

function Branch(props: {
  index: GraphIndex;
  parent: string | null;
  open: Set<string>;
  selected: string | null;
  visuals: Map<string, PartVisual>;
}) {
  const { index, parent, open, selected, visuals } = props;
  const { open: openPart } = useStore.getState();
  const parts = index.children.get(parent) ?? [];
  return (
    <ul>
      {parts.map((part) => {
        const resource =
          part.resource !== null ||
          ["database", "cache", "queue", "storage", "secrets", "external"].includes(part.kind);
        const visual = visuals.get(part.id);
        const note = visual?.badge ?? visual?.tag ?? (part.kind === "unknown" ? "unknown" : null);
        return (
          <li key={part.id}>
            <button
              type="button"
              className={s.treeRow}
              data-resource={resource}
              aria-label={part.name}
              aria-current={selected === part.id ? "true" : undefined}
              aria-expanded={part.hasInside ? open.has(part.id) : undefined}
              onClick={() => openPart(part.id)}
              title={part.does}
            >
              <span className={s.partIdentity}>
                <span>{part.name}</span>
                {!parent ? (
                  <small>
                    {resource
                      ? "External resource"
                      : part.repos
                          .map((id) => index.graph.repos.find((repo) => repo.id === id)?.name ?? id)
                          .join(" · ")}
                  </small>
                ) : null}
              </span>
              {note ? (
                <span className={`${s.mono} ${s.dim}`}>{note}</span>
              ) : part.hasInside ? (
                <span className={`${s.dim} ${s.treeMark}`} aria-hidden="true">
                  {open.has(part.id) ? <Minus /> : <Plus />}
                </span>
              ) : null}
            </button>
            {open.has(part.id) ? <Branch {...props} parent={part.id} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function Outline({ grow }: { grow: boolean }) {
  const index = useStore((state) => state.index);
  const scope = useStore((state) => state.scope);
  const selection = useStore((state) => state.selection);
  const eye = useStore((state) => state.eye);
  const matches = useStore((state) => state.matches);
  const flowId = useStore((state) => state.flowId);
  const flowStep = useStore((state) => state.flowStep);
  const selected = selection?.type === "part" ? selection.id : null;

  const visuals = useMemo(() => {
    if (!index) return new Map<string, PartVisual>();
    const flow = index.graph.flows.find((f) => f.id === flowId) ?? null;
    return partVisuals(index, { eye, scope, selected, matches, flow, flowStep });
  }, [index, eye, scope, selected, matches, flowId, flowStep]);

  const open = useMemo(() => new Set(index && scope ? pathTo(index, scope) : []), [index, scope]);
  if (!index) return null;
  return (
    <Frame title="Parts" grow={grow} secondary={!grow} label="Parts in this architecture">
      <nav className={s.tree} aria-label="Parts">
        <Branch index={index} parent={null} open={open} selected={selected} visuals={visuals} />
      </nav>
    </Frame>
  );
}
