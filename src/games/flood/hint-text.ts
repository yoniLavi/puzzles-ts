/**
 * Every sentence Flood's hint speaks. The hint replays the solver's fills, so
 * a step names the color to fill with and nothing more; the color words are the
 * palette's own (`render.ts`'s `COLOR_NAMES`).
 */

import { COLOR_NAMES } from "./render.ts";

export const say = {
  fill: (color: number): string =>
    `Fill with ${COLOR_NAMES[color] ?? `color ${color}`}.`,
};
