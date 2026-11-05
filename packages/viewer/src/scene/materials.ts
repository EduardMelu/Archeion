import { Color, ShaderMaterial } from "three";
import type { SceneTheme } from "./theme";

const VERTEX_PART = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_PART = /* glsl */ `
  uniform vec2 uSize;
  uniform vec3 uFill, uLine, uLineMain, uAccent, uMarkColor, uBlipColor, uIdentity;
  uniform float uAlpha, uLayer, uFillAlpha, uFocus, uContext, uGlow, uSelected;
  uniform float uDashed, uChamfer, uNotch, uMark, uBlip, uPing, uShadow, uStyle, uSweep, uMeta;
  varying vec2 vP;

  float sdBox(vec2 p, vec2 b) {
    vec2 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  }

  float sdChamfer(vec2 p, vec2 b, float c) {
    vec2 q = abs(p) - b;
    float box = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    return max(box, (q.x + q.y + c) * 0.7071);
  }

  // Standard over-compositing of one layer onto the running colour.
  void over(inout vec4 base, vec3 color, float amount) {
    base.rgb = mix(base.rgb, color, amount);
    base.a = max(base.a, amount);
  }

  void main() {
    vec2 b = uSize * 0.5;
    float d = sdChamfer(vP, b, uChamfer > 0.5 ? 12.0 : 4.0);
    float px = fwidth(d);

    // One soft-offset shadow lifts parts off the ground: flat 2.5D, with no perspective.
    float fallOff = sdBox(vP - vec2(0.0, -5.0), b);
    vec4 color = vec4(0.0, 0.0, 0.0, (1.0 - smoothstep(-6.0, 16.0, fallOff)) * uShadow);
    over(color, uFill, (1.0 - smoothstep(-px, 0.0, d)) * uFillAlpha);

    // The repository label belongs to the architecture, with a fine divider beneath it.
    float divider = (1.0 - smoothstep(px * 0.5, px * 1.5, abs(vP.y - (b.y - 24.0))))
      * step(abs(vP.x), b.x - 14.0) * step(25.0, b.y);
    over(color, uIdentity, divider * 0.25 * uMeta);

    // A hairline that keeps its screen width at any zoom.
    float stroke = 1.0 - smoothstep(0.0, px, abs(d) - px * (0.5 + 0.15 * uFocus));
    if (uDashed > 0.5) {
      float along = abs(vP.y) > b.y - px * 2.0 ? vP.x : vP.y;
      stroke *= step(0.5, fract(along / 11.0));
    }
    vec3 line = mix(mix(uLine, uLineMain, uContext), uAccent * uGlow, uFocus);
    over(color, line, stroke);

    // Each eye reads the same geometry through its own instrument treatment.
    float inset = abs(sdChamfer(vP, b - 4.0, 4.0));
    if (uStyle > 1.5 && uStyle < 2.5) {
      float contour = (1.0 - smoothstep(px * 0.4, px * 1.4, inset)) * uFocus;
      over(color, uAccent, contour * 0.5);
      if (uSweep > 0.0) {
        float scan = 1.0 - smoothstep(0.0, 9.0, abs(vP.y - mix(b.y, -b.y, uSweep)));
        over(color, uAccent, scan * (1.0 - smoothstep(-px, 0.0, d)) * 0.16);
      }
    }
    if (uStyle > 2.5) {
      vec2 beacon = vP - vec2(b.x - 16.0, b.y - 13.0);
      float ring = 1.0 - smoothstep(px * 0.5, px * 1.5, abs(length(beacon) - 4.0));
      over(color, uAccent * uGlow, ring * max(0.35, uFocus) * uMeta);
    }

    // "Has an inside": a small corner mark, which is also the zoom affordance.
    float corner = (vP.x - vP.y) - (b.x + b.y - 13.0);
    float notch = (1.0 - smoothstep(-px, 0.0, d + 1.0)) * smoothstep(0.0, px, corner);
    over(color, mix(uLineMain, uAccent, uFocus), notch * uNotch);

    // Selection: corner brackets, outside the box.
    float dOut = sdBox(vP, b + 7.0);
    float ring = 1.0 - smoothstep(0.0, px, abs(dOut) - px * 0.75);
    float corners = step(b.x - 8.0, abs(vP.x)) * step(b.y - 8.0, abs(vP.y));
    over(color, uAccent * uGlow, ring * corners * max(uSelected, 0.24));

    // Triage: a diamond for a warning and a square for an error, never colour alone.
    if (uMark > 0.5) {
      vec2 q = vP - vec2(b.x - 15.0, b.y - 19.0);
      float shape = uMark < 1.5 ? (abs(q.x) + abs(q.y) - 6.0) * 0.7071 : max(abs(q.x), abs(q.y)) - 4.5;
      over(color, uMarkColor, 1.0 - smoothstep(-px, px * 0.5, shape));
    }

    // Radar: a solid blip for committed work and a hollow one for local work.
    if (uBlip > 0.5) {
      float dot = length(vP - vec2(b.x - 15.0, -2.0)) - 4.5;
      float shape = uBlip < 1.5 ? dot : abs(dot + 0.9) - 0.9;
      over(color, uBlipColor, 1.0 - smoothstep(-px, px * 0.5, shape));
    }

    // Sonar: one ring, once.
    if (uPing > 0.0 && uPing < 1.0) {
      float wave = abs(d - uPing * 40.0) - px;
      over(color, uAccent * uGlow, (1.0 - smoothstep(0.0, px, wave)) * (1.0 - uPing));
    }

    color.a *= uAlpha * uLayer;
    if (color.a < 0.002) discard;
    gl_FragColor = color;
    #include <colorspace_fragment>
  }
`;

export function partMaterial(layer: { value: number }): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_PART,
    fragmentShader: FRAGMENT_PART,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uSize: { value: [1, 1] },
      uFill: { value: new Color() },
      uLine: { value: new Color() },
      uLineMain: { value: new Color() },
      uAccent: { value: new Color() },
      uMarkColor: { value: new Color() },
      uBlipColor: { value: new Color() },
      uIdentity: { value: new Color() },
      uAlpha: { value: 1 },
      uLayer: layer,
      uFillAlpha: { value: 1 },
      uFocus: { value: 0 },
      uContext: { value: 0 },
      uGlow: { value: 1 },
      uSelected: { value: 0 },
      uDashed: { value: 0 },
      uChamfer: { value: 0 },
      uNotch: { value: 0 },
      uMark: { value: 0 },
      uBlip: { value: 0 },
      uPing: { value: 0 },
      uShadow: { value: 0 },
      uStyle: { value: 0 },
      uSweep: { value: 0 },
      uMeta: { value: 0 },
    },
  });
}

const VERTEX_RIBBON = /* glsl */ `
  attribute vec2 aLine;
  attribute float aDistance;
  varying vec2 vLine;
  varying float vDistance;
  void main() {
    vLine = aLine;
    vDistance = aDistance;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_RIBBON = /* glsl */ `
  uniform vec3 uBase, uFocusColor;
  uniform float uAlpha, uLayer, uFocus, uGlow, uDashed, uProgress;
  varying vec2 vLine;
  varying float vDistance;

  void main() {
    float across = abs(vLine.x);
    float aa = max(fwidth(vLine.x), 0.001);
    float body = 1.0 - smoothstep(1.0 - aa, 1.0, across);
    float dash = uDashed > 0.5 ? step(fract(vDistance / 13.0), 0.55) : 1.0;

    // The followed flow dyes the line as the token passes, and the tint stays.
    float dye = 1.0 - smoothstep(uProgress - 0.004, uProgress + 0.004, vLine.y);
    float lit = max(uFocus, dye);
    vec3 color = mix(uBase, uFocusColor * uGlow, lit);

    float alpha = body * dash * uLayer * mix(uAlpha, 1.0, dye);
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

export function ribbonMaterial(layer: { value: number }): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_RIBBON,
    fragmentShader: FRAGMENT_RIBBON,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uBase: { value: new Color() },
      uFocusColor: { value: new Color() },
      uAlpha: { value: 1 },
      uLayer: layer,
      uFocus: { value: 0 },
      uGlow: { value: 1 },
      uDashed: { value: 0 },
      uProgress: { value: -0.01 },
    },
  });
}

const VERTEX_STATION = /* glsl */ `
  attribute vec2 aOffset;
  varying vec2 vOffset;
  void main() {
    vOffset = aOffset;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_STATION = /* glsl */ `
  uniform vec3 uRing, uFill;
  uniform float uAlpha, uLayer;
  varying vec2 vOffset;

  void main() {
    float d = length(vOffset);
    float aa = fwidth(d);
    float disc = 1.0 - smoothstep(1.0 - aa, 1.0, d);
    float core = 1.0 - smoothstep(0.52 - aa, 0.52, d);
    float alpha = disc * uAlpha * uLayer;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(mix(uRing, uFill, core), alpha);
    #include <colorspace_fragment>
  }
`;

export function stationMaterial(layer: { value: number }): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX_STATION,
    fragmentShader: FRAGMENT_STATION,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uRing: { value: new Color() },
      uFill: { value: new Color() },
      uAlpha: { value: 1 },
      uLayer: layer,
    },
  });
}

export function setColor(material: ShaderMaterial, uniform: string, value: string) {
  (material.uniforms[uniform] as { value: Color }).value.set(value);
}

export function applyPartTheme(
  material: ShaderMaterial,
  theme: SceneTheme,
  fill: string = theme.panel,
) {
  setColor(material, "uFill", fill);
  setColor(material, "uLine", theme.line);
  setColor(material, "uLineMain", theme.lineMain);
  setColor(material, "uAccent", theme.accent);
  setColor(material, "uIdentity", theme.lineMain);
  (material.uniforms.uGlow as { value: number }).value = theme.glow;
  (material.uniforms.uStyle as { value: number }).value = theme.style;
}
