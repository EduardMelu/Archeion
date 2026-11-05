// Canvas labels use the bundled Latin font files. A glyph outside them would make the text
// library wait forever on a fallback font, so it is replaced here; DOM panels show the real text.
const DRAWABLE: [number, number][] = [
  [0x20, 0xff],
  [0x131, 0x131],
  [0x152, 0x153],
  [0x2bb, 0x2bc],
  [0x2c6, 0x2c6],
  [0x2da, 0x2da],
  [0x2dc, 0x2dc],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfffd, 0xfffd],
];

const canDraw = (character: string) => {
  const code = character.codePointAt(0) ?? 0;
  return DRAWABLE.some(([from, to]) => code >= from && code <= to);
};

export function safeLabel(text: string, max = Number.POSITIVE_INFINITY): string {
  const drawable = [...text].map((character) => (canDraw(character) ? character : "?")).join("");
  return drawable.length > max ? `${drawable.slice(0, max - 1)}…` : drawable;
}
