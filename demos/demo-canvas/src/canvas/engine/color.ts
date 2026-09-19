/** Converts a hex color (e.g. `0xff6a00`) to a CSS `rgba()` string. */
export function toCssColor(color: number, alpha = 1): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
