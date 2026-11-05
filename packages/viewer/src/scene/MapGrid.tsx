import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Color, ShaderMaterial } from "three";
import { setColor } from "./materials";
import type { SceneTheme } from "./theme";

/** Static map coordinates: an eye change redraws them, but resting maps spend no frames here. */
export function MapGrid({ theme }: { theme: SceneTheme }) {
  const invalidate = useThree((state) => state.invalidate);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          uGround: { value: new Color() },
          uGrid: { value: new Color() },
          uAccent: { value: new Color() },
          uStyle: { value: 0 },
        },
        vertexShader: `
        varying vec2 vPosition;
        void main() {
          vPosition = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
        fragmentShader: `
        uniform vec3 uGround, uGrid, uAccent;
        uniform float uStyle;
        varying vec2 vPosition;
        void main() {
          vec2 p = vPosition / 40.0;
          vec2 aa = max(fwidth(p), vec2(0.001));
          vec2 distance = abs(fract(p + 0.5) - 0.5);
          vec2 lines = 1.0 - smoothstep(aa * 0.3, aa * 1.2, distance);
          float grid = max(lines.x, lines.y) * 0.3;
          if (uStyle > 0.5 && uStyle < 1.5) grid *= 0.55;
          if (uStyle > 1.5) {
            // Dots retain coordinates while leaving the diagnostic and discovery marks clear.
            grid = min(lines.x, lines.y) * 0.8;
          }
          float visible = 1.0 - smoothstep(0.12, 0.4, max(aa.x, aa.y));
          vec3 ink = mix(uGrid, uAccent, 0.13);
          gl_FragColor = vec4(mix(uGround, ink, grid * visible), 1.0);
          #include <colorspace_fragment>
        }
      `,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    setColor(material, "uGround", theme.ground);
    setColor(material, "uGrid", theme.grid);
    setColor(material, "uAccent", theme.accent);
    (material.uniforms.uStyle as { value: number }).value = theme.style;
    invalidate();
  }, [material, theme, invalidate]);
  return (
    <mesh position={[0, 0, -20]} material={material} renderOrder={-1000} raycast={() => null}>
      <planeGeometry args={[100000, 100000]} />
    </mesh>
  );
}
