import { useEffect, useMemo, useState } from "react";
import { statusSentence } from "../logic/status";
import { useStore } from "../store";
import { FailMark, shortSha } from "./shared";
import s from "./ui.module.css";

function age(iso: string | undefined, now: number): string {
  if (!iso) return "not built";
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (seconds < 60) return "built just now";
  if (seconds < 3600) return `built ${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `built ${Math.round(seconds / 3600)} h ago`;
  return `built ${Math.round(seconds / 86400)} d ago`;
}

export function StatusBar({ onIssues }: { onIssues: () => void }) {
  const index = useStore((state) => state.index);
  const info = useStore((state) => state.buildInfo);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const sentence = useMemo(() => (index ? statusSentence(index) : ""), [index]);

  if (!index) return null;
  const localRepos = new Set(
    index.graph.comparison.files.filter((f) => f.stage !== "committed").map((f) => f.repo),
  );
  const repos = index.graph.repos.filter((r) => r.git);

  return (
    <footer className={s.statusbar}>
      {info?.status === "failed" ? (
        <p className={s.statusFailure} role="alert">
          <FailMark />
          <span>The last rebuild failed, so this is the previous graph. {info.failure}</span>
        </p>
      ) : null}
      <p className={s.statusSentence}>{sentence}</p>
      {index.graph.diagnostics.length > 0 ? (
        <button type="button" className={s.statusButton} onClick={onIssues}>
          {index.graph.diagnostics.length === 1
            ? "1 issue"
            : `${index.graph.diagnostics.length} issues`}
        </button>
      ) : null}
      <span className={s.statusMeta}>
        {age(info?.builtAt, now)}
        {info?.watch ? " · watching" : ""}
      </span>
      {repos.length > 0 ? (
        <span className={s.statusMeta}>
          {repos
            .map((r) => `${r.id}@${shortSha(r.head)}${localRepos.has(r.id) ? "+local" : ""}`)
            .join(" · ")}
        </span>
      ) : null}
    </footer>
  );
}
