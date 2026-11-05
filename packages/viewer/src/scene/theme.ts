import type { Eye } from "@archeion/core/contracts";

export interface SceneTheme {
  ground: string;
  plate: string;
  panel: string;
  line: string;
  lineMain: string;
  text: string;
  textDim: string;
  accent: string;
  warn: string;
  fail: string;
  agent: string;
  resource: string;
  grid: string;
  style: number;
  glow: number;
  ghost: number;
  shadow: number;
}

export const THEMES: Record<"dark" | "light", SceneTheme> = {
  dark: {
    ground: "#050e17",
    plate: "#071722",
    panel: "#091e2b",
    line: "#376675",
    lineMain: "#6097a8",
    text: "#e5f6ff",
    textDim: "#a9c7d3",
    accent: "#43deec",
    warn: "#ffbd66",
    fail: "#ff8190",
    agent: "#69ebbd",
    resource: "#ffbd66",
    grid: "#143545",
    style: 0,
    glow: 1.55,
    // How far surroundings recede behind a cutaway, and the strength of the part shadow.
    ghost: 0.19,
    shadow: 0.58,
  },
  light: {
    ground: "#eaf2f5",
    plate: "#f8fcfd",
    panel: "#ffffff",
    line: "#6d929f",
    lineMain: "#456e7d",
    text: "#102d39",
    textDim: "#486572",
    accent: "#007581",
    warn: "#8c5300",
    fail: "#bd334f",
    agent: "#167551",
    resource: "#8c5300",
    grid: "#c8dce3",
    style: 0,
    glow: 1,
    ghost: 0.4,
    shadow: 0.12,
  },
};

const accents = {
  dark: { atlas: "#43deec", tracer: "#ffbd66", radar: "#ff8190", sonar: "#69ebbd" },
  light: { atlas: "#007581", tracer: "#8c5300", radar: "#bd334f", sonar: "#167551" },
} as const;
const styles: Record<Eye, number> = { atlas: 0, tracer: 1, radar: 2, sonar: 3 };
const eyeThemes = Object.fromEntries(
  Object.entries(THEMES).map(([name, base]) => [
    name,
    Object.fromEntries(
      Object.entries(styles).map(([eye, style]) => [
        eye,
        { ...base, accent: accents[name as "dark" | "light"][eye as Eye], style },
      ]),
    ),
  ]),
) as Record<"dark" | "light", Record<Eye, SceneTheme>>;

/** Cached eye palettes change the reading of the map without moving its architecture. */
export const sceneTheme = (theme: "dark" | "light", eye: Eye): SceneTheme => eyeThemes[theme][eye];

/** A repository keeps its identity across scopes and eyes. */
export function repositoryColor(id: string, light: boolean): string {
  const colors = light
    ? ["#007581", "#3663a3", "#167551", "#8c5300"]
    : ["#43deec", "#8ab7ff", "#69ebbd", "#ffbd66"];
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length] as string;
}
