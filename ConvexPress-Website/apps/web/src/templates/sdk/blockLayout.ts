/** Closed template choices produce the SDK's layout variables. Authored values
 * never become CSS; omitted settings keep the baseline's existing rhythm. */
const sections: Record<string, readonly string[]> = {
  compact: ["1rem", "clamp(1.5rem, 3vw, 2rem)", "clamp(3rem, 5vw, 4rem)"],
  comfortable: ["2rem", "clamp(3rem, 6vw, 6rem)", "clamp(5rem, 9vw, 9rem)"],
  spacious: ["3rem", "clamp(4rem, 8vw, 7rem)", "clamp(6rem, 10vw, 10rem)"],
};
const elements: Record<string, readonly string[]> = {
  compact: ["0.5rem", "1rem", "1.5rem", "1rem", "1rem"],
  comfortable: ["0.75rem", "1.25rem", "2rem", "1.5rem", "1.75rem"],
  spacious: ["0.75rem", "1.5rem", "2.5rem", "2rem", "2rem"],
};
const widths: Record<string, readonly string[]> = {
  narrow: ["48rem", "64rem"],
  wide: ["72rem", "92rem"],
  full: ["110rem", "110rem"],
};
const gaps: Record<string, readonly string[]> = {
  none: ["0rem"], small: ["0.75rem"], medium: ["1.5rem"], large: ["3rem"],
};
export function blockLayoutCss(layout: Record<string, unknown>): string[] {
  const output: string[] = [];
  const emit = (value: unknown, choices: Record<string, readonly string[]>, names: readonly string[]) => {
    if (typeof value !== "string" || !Object.hasOwn(choices, value)) return;
    choices[value].forEach((entry, index) => output.push(`--${names[index]}: ${entry};`));
  };
  emit(layout.sectionSpacing, sections, ["section-py-compact", "section-py-default", "section-py-spacious"]);
  emit(layout.elementSpacing, elements, ["stack-gap-sm", "stack-gap-md", "stack-gap-lg", "grid-gap", "card-pad"]);
  emit(layout.contentWidth, widths, ["section-max-contained", "section-max-wide"]);
  emit(layout.blockGap, gaps, ["block-gap"]);
  return output;
}
