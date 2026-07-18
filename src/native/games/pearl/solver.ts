/**
 * Pearl solver — a faithful port of `pearl_solve` (pearl.c). Pure iterative
 * constraint propagation over a `(2w+1)×(2h+1)` workspace (no guessing, no
 * recursion): edge↔square elimination, the black-pearl (CORNER) and
 * white-pearl (STRAIGHT) clue deductions, and shortcut-loop detection over a
 * union-find. The Tricky tier additionally runs the premature-short-loop
 * rules (gated on `difficulty`), so **both** tiers are guess-free.
 *
 * Returns the three-valued verdict: 0 = inconsistent, 1 = unique solution,
 * 2 = ambiguous. Used by the generator (uniqueness gating), `solve`, the
 * `H` autosolve hint, and `findMistakes`.
 */
import { Dsf } from "../../engine/dsf.ts";
import {
  ACW,
  bBLANK,
  bLD,
  bLR,
  bLU,
  bRD,
  bRU,
  bUD,
  CW,
  DIFF_EASY,
  DX,
  DY,
  F,
} from "./state.ts";

/**
 * @param w grid width, @param h grid height
 * @param clues clue grid (NOCLUE/CORNER/STRAIGHT), length w*h
 * @param result out array (length w*h): written when solved (or `partial`)
 * @param difficulty DIFF_EASY or DIFF_TRICKY (or DIFF_COUNT to run all rungs)
 * @param partial when true, transcribe the partial workspace even if unsolved
 * @returns 0 inconsistent, 1 unique, 2 ambiguous
 */
export function pearlSolve(
  w: number,
  h: number,
  clues: Uint8Array,
  result: Uint8Array,
  difficulty: number,
  partial: boolean,
): number {
  const W = 2 * w + 1;
  const H = 2 * h + 1;
  const ws = new Int32Array(W * H);
  let ret = -1;

  // Square states.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      switch (clues[y * w + x]) {
        case 1: // CORNER
          ws[(2 * y + 1) * W + (2 * x + 1)] = bLU | bLD | bRU | bRD;
          break;
        case 2: // STRAIGHT
          ws[(2 * y + 1) * W + (2 * x + 1)] = bLR | bUD;
          break;
        default:
          ws[(2 * y + 1) * W + (2 * x + 1)] =
            bLR | bUD | bLU | bLD | bRU | bRD | bBLANK;
          break;
      }
    }
  // Horizontal edges (disconnected at the top/bottom border, else unknown).
  for (let y = 0; y <= h; y++)
    for (let x = 0; x < w; x++)
      ws[2 * y * W + (2 * x + 1)] = y === 0 || y === h ? 2 : 3;
  // Vertical edges (disconnected at the left/right border, else unknown).
  for (let y = 0; y < h; y++)
    for (let x = 0; x <= w; x++)
      ws[(2 * y + 1) * W + 2 * x] = x === 0 || x === w ? 2 : 3;

  const dsf = new Dsf(w * h);
  const dsfsize = new Int32Array(w * h);

  loop: while (true) {
    let doneSomething = false;

    // Discard any square state inconsistent with known edges around it.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        for (let b = 0; b < 0xd; b++)
          if (ws[(2 * y + 1) * W + (2 * x + 1)] & (1 << b)) {
            for (let d = 1; d <= 8; d += d) {
              const ex = 2 * x + 1 + DX(d);
              const ey = 2 * y + 1 + DY(d);
              if (ws[ey * W + ex] === (b & d ? 2 : 1)) {
                ws[(2 * y + 1) * W + (2 * x + 1)] &= ~(1 << b);
                doneSomething = true;
                break;
              }
            }
          }
        // Consistency: each square must have at least one state left.
        if (!ws[(2 * y + 1) * W + (2 * x + 1)]) {
          ret = 0;
          break loop;
        }
      }

    // Nail down any unknown edge whose neighbouring square makes it known.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let edgeor = 0;
        let edgeand = 15;
        for (let b = 0; b < 0xd; b++)
          if (ws[(2 * y + 1) * W + (2 * x + 1)] & (1 << b)) {
            edgeor |= b;
            edgeand &= b;
          }
        // Consistency: no bit both connected and disconnected.
        if (edgeand & ~edgeor) {
          ret = 0;
          break loop;
        }
        for (let d = 1; d <= 8; d += d) {
          const ex = 2 * x + 1 + DX(d);
          const ey = 2 * y + 1 + DY(d);
          if (!(edgeor & d) && ws[ey * W + ex] === 3) {
            ws[ey * W + ex] = 2;
            doneSomething = true;
          } else if (edgeand & d && ws[ey * W + ex] === 3) {
            ws[ey * W + ex] = 1;
            doneSomething = true;
          }
        }
      }

    if (doneSomething) continue;

    // Longer-range clue-based deductions.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const clue = clues[y * w + x];
        if (clue === 1) {
          // CORNER (black pearl)
          for (let d = 1; d <= 8; d += d) {
            const ex = 2 * x + 1 + DX(d);
            const ey = 2 * y + 1 + DY(d);
            const fx = ex + DX(d);
            const fy = ey + DY(d);
            const type = d | F(d);
            if (ws[ey * W + ex] === 1) {
              // Corner connected on an edge ⇒ the square beyond it is a
              // straight in that direction.
              if (ws[fy * W + fx] !== 1 << type) {
                ws[fy * W + fx] = 1 << type;
                doneSomething = true;
              }
            } else if (ws[ey * W + ex] === 3) {
              // Corner separated by an unknown edge from a square that
              // cannot be the required straight ⇒ that edge is disconnected.
              if (!(ws[fy * W + fx] & (1 << type))) {
                ws[ey * W + ex] = 2;
                doneSomething = true;
              }
            }
          }
        } else if (clue === 2) {
          // STRAIGHT (white pearl)
          // If a straight is between two squares neither of which can be a
          // corner connected to it, it cannot point that way.
          for (let d = 1; d <= 2; d += d) {
            const fx = 2 * x + 1 + 2 * DX(d);
            const fy = 2 * y + 1 + 2 * DY(d);
            const gx = 2 * x + 1 - 2 * DX(d);
            const gy = 2 * y + 1 - 2 * DY(d);
            const type = d | F(d);
            if (!(ws[(2 * y + 1) * W + (2 * x + 1)] & (1 << type))) continue;
            if (
              !(ws[fy * W + fx] & ((1 << (F(d) | ACW(d))) | (1 << (F(d) | CW(d))))) &&
              !(ws[gy * W + gx] & ((1 << (d | ACW(d))) | (1 << (d | CW(d)))))
            ) {
              ws[(2 * y + 1) * W + (2 * x + 1)] &= ~(1 << type);
              doneSomething = true;
            }
          }
          // If a straight with known direction connects on one side to a
          // known straight, the other side must be a corner.
          for (let d = 1; d <= 8; d += d) {
            const fx = 2 * x + 1 + 2 * DX(d);
            const fy = 2 * y + 1 + 2 * DY(d);
            const gx = 2 * x + 1 - 2 * DX(d);
            const gy = 2 * y + 1 - 2 * DY(d);
            const type = d | F(d);
            if (ws[(2 * y + 1) * W + (2 * x + 1)] !== 1 << type) continue;
            if (
              !(ws[fy * W + fx] & ~(bLR | bUD)) &&
              ws[gy * W + gx] & ~(bLU | bLD | bRU | bRD)
            ) {
              ws[gy * W + gx] &= bLU | bLD | bRU | bRD;
              doneSomething = true;
            }
          }
        }
      }

    if (doneSomething) continue;

    // Detect shortcut loops.
    {
      dsf.reinit();
      for (let x = 0; x < w * h; x++) dsfsize[x] = 1;

      let nonblanks = 0;
      let loopclass = -1;
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          if ((y ^ x) & 1) {
            // Edge field. Compute the squares it connects.
            const ax = (x - 1) >> 1;
            const ay = (y - 1) >> 1;
            const ac = ay * w + ax;
            const bx = x >> 1;
            const by = y >> 1;
            const bc = by * w + bx;
            if (ws[y * W + x] === 1) {
              let ae = dsf.canonify(ac);
              const be = dsf.canonify(bc);
              if (ae === be) {
                if (loopclass !== -1) {
                  // Two separate loops: doom.
                  ret = 0;
                  break loop;
                }
                loopclass = ae;
              } else {
                const size = dsfsize[ae] + dsfsize[be];
                dsf.merge(ac, bc);
                ae = dsf.canonify(ac);
                dsfsize[ae] = size;
              }
            }
          } else if (y & x & 1) {
            // Square field. Count if it's definitely non-blank.
            if (!(ws[y * W + x] & bBLANK)) nonblanks++;
          }
        }

      // If we found an existing loop, blank every square not part of it.
      if (loopclass !== -1) {
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            if (dsf.canonify(y * w + x) !== loopclass) {
              if (ws[(y * 2 + 1) * W + (x * 2 + 1)] & bBLANK) {
                ws[(y * 2 + 1) * W + (x * 2 + 1)] = bBLANK;
              } else {
                // Non-blank square outside the loop: goofed.
                ret = 0;
                break loop;
              }
            }
        ret = 1;
        break;
      }

      // Further deductions are considered 'tricky'.
      if (difficulty === DIFF_EASY) {
        if (doneSomething) continue;
        ret = 2;
        break;
      }

      // Mark any edge/square-state that would create a shortcut loop.
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          if ((y ^ x) & 1) {
            const ax = (x - 1) >> 1;
            const ay = (y - 1) >> 1;
            const ac = ay * w + ax;
            const bx = x >> 1;
            const by = y >> 1;
            const bc = by * w + bx;
            if (ws[y * W + x] === 3) {
              const ae = dsf.canonify(ac);
              const be = dsf.canonify(bc);
              if (ae === be) {
                if (dsfsize[ae] < nonblanks) {
                  ws[y * W + x] = 2;
                  doneSomething = true;
                }
              }
            }
          } else if (y & x & 1) {
            const ae = dsf.canonify(((y / 2) | 0) * w + ((x / 2) | 0));
            for (let b = 2; b < 0xd; b++)
              if (ws[y * W + x] & (1 << b)) {
                let e = -1;
                let connections = 0;
                for (let d = 1; d <= 8; d += d)
                  if (b & d) {
                    const xx = ((x / 2) | 0) + DX(d);
                    const yy = ((y / 2) | 0) + DY(d);
                    const ee = dsf.canonify(yy * w + xx);
                    if (e === -1) e = ee;
                    else if (e !== ee) e = -2;
                    if (ws[(y + DY(d)) * W + (x + DX(d))] === 1) connections++;
                  }
                if (e >= 0 && connections < 2) {
                  let loopsize = dsfsize[e];
                  if (e !== ae) loopsize++; // add the square itself
                  if (loopsize < nonblanks) {
                    ws[y * W + x] &= ~(1 << b);
                    doneSomething = true;
                  }
                }
              }
          }
        }
    }

    if (doneSomething) continue;

    // Nothing left to do: ambiguous.
    ret = 2;
    break;
  }

  // Transcribe the workspace into result when solved (or on request).
  if (ret === 1 || partial) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        // When the square is nailed to one state, write it; otherwise (only
        // possible under `partial`) leave the caller's prior value in place.
        for (let b = 0; b < 0xd; b++)
          if (ws[(2 * y + 1) * W + (2 * x + 1)] === 1 << b) {
            result[y * w + x] = b;
            break;
          }
      }

    // Fix up reciprocity: never leave a square linked to a neighbour that
    // does not link back (can happen when we give up on an impossible board).
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        for (let d = 1; d <= 8; d += d) {
          const nx = x + DX(d);
          const ny = y + DY(d);
          let rlink: number;
          if (0 <= nx && nx < w && 0 <= ny && ny < h)
            rlink = result[ny * w + nx] & F(d);
          else rlink = 0;
          if (!rlink) result[y * w + x] &= ~d;
        }
      }
  }

  return ret;
}

/** Easiest difficulty (0-based) at which `clues` has a unique solution, or
 * -1 if none. */
export function gradePearl(w: number, h: number, clues: Uint8Array): number {
  const scratch = new Uint8Array(w * h);
  for (let diff = DIFF_EASY; diff < 2; diff++) {
    if (pearlSolve(w, h, clues, scratch, diff, false) === 1) return diff;
  }
  return -1;
}
