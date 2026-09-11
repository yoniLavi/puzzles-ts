import { createContext } from "@lit/context";
import type { Puzzle } from "./puzzle.ts";

export const puzzleContext = createContext<Puzzle>("puzzle-context");
