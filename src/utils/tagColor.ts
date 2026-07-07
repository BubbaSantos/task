// Deterministic color per tag name — same tag always gets the same hue.
const HUES = [260, 160, 30, 300, 200, 90, 340, 130, 220, 60];

function hashTag(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffff;
  return h;
}

export function tagColor(tag: string): { bg: string; text: string } {
  const hue = HUES[hashTag(tag) % HUES.length];
  return {
    bg:   `oklch(0.92 0.07 ${hue})`,
    text: `oklch(0.42 0.20 ${hue})`,
  };
}
