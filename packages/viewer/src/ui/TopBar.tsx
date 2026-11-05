import type { Eye } from "@archeion/core/contracts";
import { pathTo } from "../logic/graphIndex";
import { cameraControl } from "../scene/control";
import { useStore } from "../store";
import { Fit, Minus, Moon, Plus, Sun } from "./icons";
import s from "./ui.module.css";

export const EYES: { id: Eye; label: string; question: string; purpose: string }[] = [
  {
    id: "atlas",
    label: "Atlas",
    purpose: "Structure",
    question: "How does the system fit together?",
  },
  {
    id: "tracer",
    label: "Tracer",
    purpose: "Data flows",
    question: "Follow a request from start to finish.",
  },
  {
    id: "radar",
    label: "Radar",
    purpose: "Changes",
    question: "What changed, and what is connected to it?",
  },
  {
    id: "sonar",
    label: "Sonar",
    purpose: "Capabilities",
    question: "Find what the system already knows how to do.",
  },
];

function EyeIcon({ eye }: { eye: Eye }) {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="13" strokeDasharray="19 3 5 3" />
      {eye === "atlas" ? (
        <>
          <path d="M16 6v8M9 23l7-9 7 9M9 23h14" />
          <circle cx="16" cy="8" r="2.5" />
          <circle cx="9" cy="23" r="2.5" />
          <circle cx="23" cy="23" r="2.5" />
        </>
      ) : null}
      {eye === "tracer" ? (
        <>
          <path d="M8 21h5a4 4 0 0 0 0-8h6a4 4 0 0 0 4-4" />
          <circle cx="8" cy="21" r="2" fill="currentColor" />
          <path d="m20 10 3-2 1 4" />
        </>
      ) : null}
      {eye === "radar" ? (
        <>
          <circle cx="16" cy="16" r="8" />
          <path d="M16 16V4M16 16l10 7" />
          <circle cx="11" cy="20" r="2" fill="currentColor" />
        </>
      ) : null}
      {eye === "sonar" ? (
        <>
          <circle cx="16" cy="16" r="8" />
          <circle cx="16" cy="16" r="3" />
          <path d="M3 16h5M24 16h5M16 3v5M16 24v5" />
        </>
      ) : null}
    </svg>
  );
}

export function TopBar({
  onWorkspace,
  workspaceOpen,
}: {
  onWorkspace: () => void;
  workspaceOpen: boolean;
}) {
  const index = useStore((state) => state.index);
  const scope = useStore((state) => state.scope);
  const eye = useStore((state) => state.eye);
  const theme = useStore((state) => state.theme);
  const left = useStore((state) => state.left);
  const { setEye, setScope, toggleTheme, setLeft, select } = useStore.getState();
  if (!index) return null;
  const path = scope ? pathTo(index, scope) : [];
  return (
    <header className={s.topbar}>
      <span className={s.brand}>
        <svg
          width="24"
          height="28"
          viewBox="0 0 24 28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="m12 1 10 6v14l-10 6-10-6V7zM2 7l10 6 10-6M12 13v14M7 10v8l5 3 5-3v-8" />
        </svg>{" "}
        ARCHEION
      </span>
      <nav className={s.crumbs} aria-label="Location on the map">
        <ol>
          <li>
            <button
              type="button"
              className={s.crumb}
              aria-current={scope === null ? "location" : undefined}
              onClick={() => {
                setScope(null);
                select(null);
              }}
            >
              {index.graph.workspace.name}
            </button>
          </li>
          {path.map((id) => (
            <li key={id}>
              <button
                type="button"
                className={s.crumb}
                aria-current={id === scope ? "location" : undefined}
                onClick={() => {
                  setScope(id);
                  select({ type: "part", id });
                }}
              >
                {index.parts.get(id)?.name}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className={s.tools}>
        <button
          type="button"
          className={s.iconButton}
          aria-label="Zoom out"
          title="Zoom out (-)"
          onClick={() => cameraControl.zoomBy(0.75)}
        >
          <Minus />
        </button>
        <button
          type="button"
          className={s.iconButton}
          aria-label="Zoom in"
          title="Zoom in (+)"
          onClick={() => cameraControl.zoomBy(1.33)}
        >
          <Plus />
        </button>
        <button
          type="button"
          className={s.iconButton}
          aria-label="Fit the view"
          title="Fit the view (0)"
          onClick={() => cameraControl.fit()}
        >
          <Fit />
        </button>
        <button
          type="button"
          className={s.iconButton}
          aria-label={theme === "dark" ? "Use the light theme" : "Use the dark theme"}
          title="Switch theme"
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
        <details className={s.moreMenu}>
          <summary aria-label="More options" title="More options">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
              <circle cx="3" cy="9" r="1.5" />
              <circle cx="9" cy="9" r="1.5" />
              <circle cx="15" cy="9" r="1.5" />
            </svg>
          </summary>
          <div>
            <button
              type="button"
              className={s.row}
              data-map-info
              aria-pressed={workspaceOpen}
              onClick={onWorkspace}
            >
              Map information
            </button>
            <button
              type="button"
              className={s.row}
              aria-label="Saved investigations"
              aria-pressed={left === "trails"}
              onClick={() => setLeft(left === "trails" ? "eye" : "trails")}
            >
              Saved views
            </button>
          </div>
        </details>
      </div>
      <div className={s.eyes} role="group" aria-label="Eyes">
        {EYES.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className={s.eye}
            data-eye={item.id}
            aria-pressed={eye === item.id && left === "eye"}
            title={item.question}
            onClick={() => setEye(item.id)}
          >
            <EyeIcon eye={item.id} />
            <span className={s.eyeCopy}>
              <strong>{item.label}</strong>
              <span className={s.eyePurpose}>{item.purpose}</span>
            </span>
            <kbd>{i + 1}</kbd>
          </button>
        ))}
      </div>
    </header>
  );
}
