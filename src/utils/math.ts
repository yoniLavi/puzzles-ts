export const clamp = (min: number, value: number, max: number) =>
  Math.max(min, Math.min(value, max));
