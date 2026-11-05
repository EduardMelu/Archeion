// Shared motion rules: exponential approach for state changes, nothing runs at rest.
import { create } from "zustand";

const query =
  typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

export const motion = {
  get reduced() {
    return query?.matches ?? false;
  },
};

// A demand-rendered canvas can wake after seconds at rest. That idle time is not animation time.
export const frameDelta = (delta: number): number => Math.min(Math.max(delta, 0), 0.05);

/** Moves `current` toward `target`; returns the new value, snapping once visually done. */
export function approach(current: number, target: number, delta: number, rate = 14): number {
  if (motion.reduced || Math.abs(target - current) < 0.002) return target;
  return target + (current - target) * Math.exp(-rate * frameDelta(delta));
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Shared between the flow runner and the line it is dyeing. */
export const tokenState = { edge: null as string | null, progress: 0, visible: false };

/** Adaptive quality: resolution and effects give way before legibility or responsiveness. */
export const QUALITY_LEVELS = [
  { dpr: 1, bloom: false },
  { dpr: 1, bloom: true },
  { dpr: 1.5, bloom: true },
  { dpr: 2, bloom: true },
] as const;

const params = typeof location === "undefined" ? null : new URLSearchParams(location.search);
const forced = params?.get("quality");

interface QualityState {
  level: number;
  locked: boolean;
  lower: () => void;
}

export const useQuality = create<QualityState>((set, get) => ({
  level: forced !== null && forced !== undefined ? Number(forced) : QUALITY_LEVELS.length - 1,
  locked: forced !== null && forced !== undefined,
  lower: () => {
    const { level, locked } = get();
    if (!locked && level > 0) set({ level: level - 1 });
  },
}));

export const debugEnabled = params?.has("debug") ?? false;
