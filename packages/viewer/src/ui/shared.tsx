import type { Evidence, Provenance } from "@archeion/core/contracts";
import type { ReactNode } from "react";
import s from "./ui.module.css";

export function Frame(props: {
  title: string;
  grow?: boolean;
  secondary?: boolean;
  children: ReactNode;
  label?: string;
}) {
  return (
    <section
      className={`${s.frame} ${props.grow ? s.frameGrow : ""} ${props.secondary ? s.frameSecondary : ""}`}
      aria-label={props.label ?? props.title}
    >
      <h2 className={s.frameTitle}>{props.title}</h2>
      <div className={s.frameBody}>{props.children}</div>
    </section>
  );
}

const PROVENANCE: Record<Provenance, string> = {
  reviewed: "reviewed",
  extracted: "extracted",
  both: "reviewed + extracted",
};

export const ProvenanceTag = ({ value }: { value: Provenance }) => (
  <span className={s.tag} title="Where this comes from">
    {PROVENANCE[value]}
  </span>
);

export function EvidenceList({ items }: { items: Evidence[] }) {
  if (items.length === 0) return <p className={s.note}>No evidence is recorded.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li
          className={s.evidenceRow}
          key={`${item.repo}|${item.file}|${item.line}|${item.kind}|${item.detail}`}
        >
          <span className={s.mono}>
            {item.repo}:{item.file}
            {item.line ? `:${item.line}` : ""}
          </span>
          <span className={s.rowMeta}>
            {item.kind}
            {item.detail ? ` · ${item.detail}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export const WarnMark = () => <span className={s.diamond} role="img" aria-label="Warning" />;
export const FailMark = () => <span className={s.square} role="img" aria-label="Error" />;

export const shortSha = (sha: string | null | undefined) => sha?.slice(0, 7) ?? "none";
