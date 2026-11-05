// Loads generated artifacts once, verifying the digest and validating the contract before the
// previous usable model is replaced.
import { buildInfoSchema, GRAPH_VERSION, graphSchema } from "@archeion/core/contracts";
import { useStore } from "../store";

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function refreshArtifacts(): Promise<void> {
  const { setGraph, setBuildInfo, setLoadError, digest: current } = useStore.getState();
  let infoResponse: Response;
  try {
    infoResponse = await fetch("data/build-info.json", { cache: "no-store" });
  } catch {
    if (!current)
      setLoadError("Cannot reach the local Archeion server. Is `archeion view` still running?");
    return;
  }
  if (!infoResponse.ok) {
    if (!current)
      setLoadError("No generated graph was found. Run `archeion build`, then reload this page.");
    return;
  }

  const info = buildInfoSchema.safeParse(await infoResponse.json().catch(() => null));
  if (!info.success) {
    if (!current)
      setLoadError(
        "build-info.json does not match this viewer. Rebuild with the same Archeion version.",
      );
    return;
  }
  setBuildInfo(info.data);
  if (info.data.graphDigest === current) return;
  if (!info.data.graphDigest) {
    if (!current) setLoadError(info.data.failure ?? "The build produced no graph.");
    return;
  }

  const response = await fetch("data/graph.json", { cache: "no-store" });
  if (!response.ok) {
    if (!current)
      setLoadError("graph.json is missing. Run `archeion build`, then reload this page.");
    return;
  }
  const bytes = await response.arrayBuffer();
  const digest = await sha256(bytes);
  // A mismatch means a rebuild landed between the two reads; the next poll picks up a coherent pair.
  if (digest !== info.data.graphDigest) {
    if (!current) setTimeout(refreshArtifacts, 300);
    return;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    if (!current) setLoadError("graph.json is not valid JSON. Run `archeion build` again.");
    return;
  }
  const version = (raw as { version?: unknown } | null)?.version;
  if (version !== GRAPH_VERSION) {
    if (!current) {
      setLoadError(
        `This graph uses contract version ${String(version)}; this viewer reads version ${GRAPH_VERSION}. Rebuild with the same Archeion version.`,
      );
    }
    return;
  }
  const graph = graphSchema.safeParse(raw);
  if (!graph.success) {
    if (!current) {
      setLoadError(
        `graph.json failed validation: ${graph.error.issues[0]?.path.join(".")}: ${graph.error.issues[0]?.message}`,
      );
    }
    return;
  }
  setGraph(graph.data, digest, info.data);
}

const POLL_MS = 2000;

/** Polls lightweight build metadata in watch mode, and otherwise loads once. */
export function startArtifactLoading(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const tick = async () => {
    await refreshArtifacts().catch((error) => {
      if (!useStore.getState().digest) useStore.getState().setLoadError(String(error));
    });
    if (!stopped && useStore.getState().buildInfo?.watch) timer = setTimeout(tick, POLL_MS);
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export async function requestRebuild(bases: Record<string, string>): Promise<void> {
  const response = await fetch("api/rebuild", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bases }),
  });
  if (!response.ok) throw new Error(`The rebuild was refused (${response.status}).`);
  await refreshArtifacts();
}
