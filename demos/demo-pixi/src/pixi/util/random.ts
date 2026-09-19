export function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
