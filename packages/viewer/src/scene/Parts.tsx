import chakra600 from "@fontsource/chakra-petch/files/chakra-petch-latin-600-normal.woff?url";
import mono400 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff?url";
import sans400 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff?url";
import sans500 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff?url";
import { Text } from "@react-three/drei";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Mesh } from "three";
import type { Tone } from "../logic/emphasis";
import { safeLabel } from "../logic/labels";
import type { NodeBox } from "../logic/layoutPolicy";
import { cameraControl } from "./control";
import { applyPartTheme, partMaterial, setColor } from "./materials";
import { approach, frameDelta, motion } from "./motion";
import type { SceneTheme } from "./theme";

export const FONTS = { heading: chakra600, label: sans500, body: sans400, mono: mono400 };

// Font files are bundled. Any glyph outside them is replaced by safeLabel, so this local path is
// never fetched; it exists so the text library can never reach out to its default CDN.
const NO_FONT_CDN = "/no-fallback-fonts";

const PAD = 48;
const NAME_SIZE = 15;
const DETAIL_SIZE = 11;
const STUB_SIZE = 12;
const BADGE_SIZE = 10.5;
const SANS_ADVANCE = 0.53;
const MONO_ADVANCE = 0.6;

// Legibility floor: labels never draw smaller than this on screen, however far the camera is out.
// They grow inside the box, and what no longer fits is cut at a character with an ellipsis, so the
// layout never changes. The zoom is bucketed so text is only re-laid out at these steps, not per frame.
const FLOOR = { name: 12, detail: 10, stub: 10.5, badge: 10 };
const ZOOM_BUCKETS = [1, 0.92, 0.85, 0.78, 0.72, 0.66, 0.6, 0.55, 0.5, 0.45];
const MAX_LABEL_SCALE = 2;

const bucketFor = (onScreen: number) =>
  ZOOM_BUCKETS.find((bucket) => onScreen >= bucket) ?? (ZOOM_BUCKETS.at(-1) as number);
const scaleFor = (size: number, floor: number, onScreen: number) =>
  Math.min(MAX_LABEL_SCALE, Math.max(1, floor / (size * onScreen)));
const fit = (text: string, width: number, size: number, advance: number) =>
  safeLabel(text, Math.max(4, Math.floor(width / (size * advance))));

export type TextMesh = Mesh & { fillOpacity: number };

export const Label = memo(function Label(props: {
  text: string;
  x: number;
  y: number;
  size: number;
  font: string;
  color: string;
  order: number;
  scale?: number;
  anchorX?: "left" | "right" | "center";
  textRef?: (mesh: TextMesh | null) => void;
}) {
  return (
    <Text
      ref={props.textRef as never}
      position={[props.x, props.y, 0]}
      scale={props.scale ?? 1}
      fontSize={props.size}
      font={props.font}
      color={props.color}
      anchorX={props.anchorX ?? "left"}
      anchorY="middle"
      renderOrder={props.order}
      sdfGlyphSize={64}
      {...{ unicodeFontsURL: NO_FONT_CDN }}
    >
      {props.text}
    </Text>
  );
});

/**
 * How strongly a layer's labels show. Ghosted surroundings keep their shapes but lose their text:
 * magnified by the zoom, their labels would outshout the part being read and fail contrast.
 */
export const labelStrength = (layer: number, ghost: number) =>
  Math.min(1, Math.max(0, (layer - ghost) / (1 - ghost)));

const TONE_ALPHA: Record<Tone, number> = { quiet: 1, context: 1, focus: 1, dim: 0.28 };
// Semantic labels stay opaque; only their frame and optional detail recede on a dimmed part.

export interface PartBoxProps {
  id: string;
  box: NodeBox;
  name: string;
  detail: string;
  meta: string;
  identity: string;
  tone: Tone;
  badge: string | null;
  blip: "none" | "solid" | "hollow";
  tag: string | null;
  agent: boolean;
  selected: boolean;
  hasInside: boolean;
  resource: boolean;
  unknown: boolean;
  isAgentKind: boolean;
  extractedOnly: boolean;
  mark: "error" | "warning" | null;
  markCount: number;
  stub: boolean;
  theme: SceneTheme;
  layer: { value: number };
  /** The scale of this scope's frame in world space, for the label floor. */
  frameScale: number;
  order: number;
  pingToken: number;
  onActivate: (id: string) => void;
}

export const PartBox = memo(function PartBox(props: PartBoxProps) {
  const { box, theme, tone, layer, order, stub, selected, pingToken, frameScale } = props;
  const invalidate = useThree((state) => state.invalidate);
  const material = useMemo(() => partMaterial(layer), [layer]);
  useEffect(() => () => material.dispose(), [material]);
  const u = material.uniforms as Record<string, { value: number }>;
  const [zoomBucket, setZoomBucket] = useState(1);

  const texts = useRef<(TextMesh | null)[]>([]);
  const nameAlphaTarget = 1;
  const detailAlphaTarget = tone === "dim" ? 0 : 1;
  const current = useRef({
    alpha: TONE_ALPHA[tone],
    focus: tone === "focus" ? 1 : 0,
    context: tone === "context" ? 1 : 0,
    selected: selected ? 1 : 0,
    ping: 0,
    sweep: 0,
    nameAlpha: nameAlphaTarget,
    detailAlpha: detailAlphaTarget,
    strength: -1,
  });

  useLayoutEffect(() => {
    applyPartTheme(material, theme);
    setColor(material, "uIdentity", props.identity);
    if (props.resource) {
      setColor(material, "uLine", theme.resource);
      setColor(material, "uLineMain", theme.resource);
    }
    setColor(material, "uBlipColor", props.agent ? theme.agent : theme.accent);
    setColor(material, "uMarkColor", props.mark === "error" ? theme.fail : theme.warn);
    if (props.isAgentKind) setColor(material, "uLine", theme.agent);
    (material.uniforms.uSize as { value: number[] }).value = [box.w, box.h];
    (u.uDashed as { value: number }).value = props.unknown ? 1 : 0;
    (u.uChamfer as { value: number }).value = props.resource ? 1 : 0;
    (u.uNotch as { value: number }).value = props.hasInside ? 1 : 0;
    (u.uMark as { value: number }).value =
      props.mark === "error" ? 2 : props.mark === "warning" ? 1 : 0;
    (u.uBlip as { value: number }).value =
      props.blip === "solid" ? 1 : props.blip === "hollow" ? 2 : 0;
    (u.uFillAlpha as { value: number }).value = stub ? 0 : props.extractedOnly ? 0.55 : 1;
    (u.uShadow as { value: number }).value = stub ? 0 : theme.shadow;
    (u.uMeta as { value: number }).value = !stub && props.meta ? 1 : 0;
    invalidate();
  }, [
    material,
    u,
    theme,
    box,
    stub,
    invalidate,
    props.agent,
    props.mark,
    props.isAgentKind,
    props.unknown,
    props.resource,
    props.hasInside,
    props.blip,
    props.extractedOnly,
    props.identity,
    props.meta,
  ]);

  useEffect(() => {
    current.current.sweep = motion.reduced || theme.style !== 2 ? 0 : 0.001;
    invalidate();
  }, [theme.style, invalidate]);

  // Wake the frame loop when a decision changes; useFrame eases to it and goes back to sleep.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tone and selected are wake-up triggers.
  useEffect(() => invalidate(), [tone, selected, invalidate]);

  // Only a new search pings, not a later tone change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tone is deliberately read at ping time.
  useEffect(() => {
    if (pingToken > 0 && tone === "focus" && !motion.reduced) {
      current.current.ping = 0.001;
      invalidate();
    }
  }, [pingToken, invalidate]);

  useFrame((state, delta) => {
    // Re-fit labels once the camera lands, not during a flight.
    if (!cameraControl.moving()) {
      const bucket = bucketFor(state.camera.zoom * frameScale);
      if (bucket !== zoomBucket) setZoomBucket(bucket);
    }

    const c = current.current;
    const alpha = TONE_ALPHA[tone] * (stub ? 0.8 : 1);
    const focus = tone === "focus" ? 1 : 0;
    const context = tone === "context" ? 1 : 0;
    const chosen = selected ? 1 : 0;
    c.alpha = approach(c.alpha, alpha, delta);
    c.focus = approach(c.focus, focus, delta);
    c.context = approach(c.context, context, delta);
    c.selected = approach(c.selected, chosen, delta, 22);
    const nameAlpha = approach(c.nameAlpha, nameAlphaTarget, delta);
    const detailAlpha = approach(c.detailAlpha, detailAlphaTarget, delta);
    const strength = labelStrength(layer.value, theme.ghost);
    const textChanged =
      nameAlpha !== c.nameAlpha || detailAlpha !== c.detailAlpha || strength !== c.strength;
    c.nameAlpha = nameAlpha;
    c.detailAlpha = detailAlpha;
    c.strength = strength;
    const moving =
      c.alpha !== alpha ||
      c.focus !== focus ||
      c.context !== context ||
      c.selected !== chosen ||
      nameAlpha !== nameAlphaTarget ||
      detailAlpha !== detailAlphaTarget ||
      c.ping > 0 ||
      c.sweep > 0;
    (u.uAlpha as { value: number }).value = c.alpha;
    (u.uFocus as { value: number }).value = c.focus;
    (u.uContext as { value: number }).value = c.context;
    (u.uSelected as { value: number }).value = c.selected;
    if (c.ping > 0) {
      c.ping += frameDelta(delta) / 0.85;
      if (c.ping >= 1) c.ping = 0;
      (u.uPing as { value: number }).value = c.ping;
    }
    if (c.sweep > 0) {
      c.sweep += frameDelta(delta) / 0.9;
      if (c.sweep >= 1) c.sweep = 0;
      (u.uSweep as { value: number }).value = c.sweep;
    }
    if (textChanged) {
      texts.current.forEach((text, i) => {
        if (text) text.fillOpacity = (i === 1 ? detailAlpha : nameAlpha) * strength;
      });
    }
    if (moving) invalidate();
  });

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4) return;
    event.stopPropagation();
    props.onActivate(props.id);
  };

  const setText = (i: number) => (mesh: TextMesh | null) => {
    texts.current[i] = mesh;
    if (!mesh) return;
    const c = current.current;
    mesh.fillOpacity =
      (i === 1 ? c.detailAlpha : c.nameAlpha) * labelStrength(layer.value, theme.ghost);
  };

  const left = -box.w / 2 + 14;
  const nameScale = stub
    ? scaleFor(STUB_SIZE, FLOOR.stub, zoomBucket)
    : scaleFor(NAME_SIZE, FLOOR.name, zoomBucket);
  const detailScale = scaleFor(DETAIL_SIZE, FLOOR.detail, zoomBucket);
  const badgeScale = scaleFor(BADGE_SIZE, FLOOR.badge, zoomBucket);
  const hasRightMark = props.mark !== null || props.blip !== "none";
  const textWidth = box.w - (stub ? 16 : 28) - (hasRightMark ? 26 : 0);
  const name = stub
    ? fit(props.name, textWidth, STUB_SIZE * nameScale, SANS_ADVANCE)
    : fit(props.name, textWidth, NAME_SIZE * nameScale, SANS_ADVANCE);
  const detail = props.tag ? `${props.tag} · ${props.detail}` : props.detail;
  const badgeWidth = props.badge
    ? (props.badge.length * BADGE_SIZE * MONO_ADVANCE + 12) * badgeScale
    : 0;

  return (
    <group position={[box.x + box.w / 2, -(box.y + box.h / 2), 0]}>
      {/* The padded plane has room for brackets and rings; the click target is the box below. */}
      <mesh renderOrder={order} material={material} raycast={() => null}>
        <planeGeometry args={[box.w + PAD * 2, box.h + PAD * 2]} />
      </mesh>
      <mesh
        visible={false}
        onClick={onClick}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[box.w, box.h]} />
      </mesh>
      <Label
        text={name}
        x={stub ? 0 : left}
        y={0}
        size={stub ? STUB_SIZE : NAME_SIZE}
        scale={nameScale}
        font={stub ? FONTS.body : FONTS.label}
        color={stub ? theme.textDim : theme.text}
        order={order + 2}
        anchorX={stub ? "center" : "left"}
        textRef={setText(0)}
      />
      {!stub && props.meta ? (
        <Label
          text={fit(props.meta.toUpperCase(), box.w - 44, BADGE_SIZE * badgeScale, MONO_ADVANCE)}
          x={left}
          y={box.h / 2 - 13}
          size={BADGE_SIZE}
          scale={badgeScale}
          font={FONTS.mono}
          color={props.identity}
          order={order + 2}
          textRef={setText(4)}
        />
      ) : null}
      {!stub && detail ? (
        <Label
          text={fit(detail, box.w - 28, DETAIL_SIZE * detailScale, MONO_ADVANCE)}
          x={left}
          y={-23}
          size={DETAIL_SIZE}
          scale={detailScale}
          font={FONTS.mono}
          color={theme.textDim}
          order={order + 2}
          textRef={setText(1)}
        />
      ) : null}
      {props.badge ? (
        <group position={[-box.w / 2 + 12 + badgeWidth / 2, box.h / 2, 0]}>
          {/* Notched into the top border, the way a frame title sits. */}
          <mesh renderOrder={order + 1}>
            <planeGeometry args={[badgeWidth, 16 * badgeScale]} />
            <meshBasicMaterial
              color={theme.ground}
              transparent
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <Label
            text={safeLabel(props.badge)}
            x={0}
            y={0}
            size={BADGE_SIZE}
            scale={badgeScale}
            font={FONTS.mono}
            color={theme.accent}
            order={order + 2}
            anchorX="center"
            textRef={setText(2)}
          />
        </group>
      ) : null}
      {props.mark && props.markCount > 1 ? (
        <Label
          text={String(props.markCount)}
          x={box.w / 2 - 25}
          y={box.h / 2 - 19}
          size={BADGE_SIZE}
          scale={badgeScale}
          font={FONTS.mono}
          color={props.mark === "error" ? theme.fail : theme.warn}
          order={order + 2}
          anchorX="right"
          textRef={setText(3)}
        />
      ) : null}
    </group>
  );
});
