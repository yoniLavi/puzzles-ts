/*
 * ascent-trace.c: C-reference fixture generator for the Ascent TS port
 * (openspec add-ascent-ts-port).
 *
 * Includes unreleased/ascent.c directly (its functions are static) and, for
 * a curated set of (params, seed) tuples spanning all five grid modes and the
 * four difficulty tiers, generates a board with the upstream generator and
 * emits the desc as JSON. The TS port replays the same (params, seed) through
 * `newAscentDesc` and asserts byte-for-byte equality of the desc. Because the
 * generator gates every clue removal (or edge matching) on the graded solver,
 * one byte-match validates the generator, the four-tier solver and the
 * run-length codec together (design D7).
 *
 * Build (needs the real random.c, so the pure-C config):
 *   rm -rf build/native
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make ascent-trace)
 *   build/native/auxiliary/ascent-trace \
 *     > src/native/games/ascent/__fixtures__/ascent-c-reference.json
 *
 * ascent.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../unreleased/ascent.c"

typedef struct {
    int w, h, diff, mode;
    int removeends, symmetrical;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* Rectangle: all four difficulties + a size sweep */
    { 5, 5, DIFF_EASY,   MODE_RECT, 0, 0, "ascent-rect-5x5-e" },
    { 5, 5, DIFF_NORMAL, MODE_RECT, 0, 0, "ascent-rect-5x5-n" },
    { 5, 5, DIFF_TRICKY, MODE_RECT, 0, 0, "ascent-rect-5x5-t" },
    { 5, 5, DIFF_HARD,   MODE_RECT, 0, 0, "ascent-rect-5x5-h" },
    { 4, 4, DIFF_NORMAL, MODE_RECT, 0, 0, "ascent-rect-4x4-n" },
    { 7, 6, DIFF_EASY,   MODE_RECT, 0, 0, "ascent-rect-7x6-e" },
    { 7, 6, DIFF_HARD,   MODE_RECT, 0, 0, "ascent-rect-7x6-h" },

    /* Rectangle, no diagonals (orthogonal) */
    { 5, 5, DIFF_EASY,   MODE_ORTHOGONAL, 0, 0, "ascent-orth-5x5-e" },
    { 5, 5, DIFF_NORMAL, MODE_ORTHOGONAL, 0, 0, "ascent-orth-5x5-n" },
    { 6, 5, DIFF_TRICKY, MODE_ORTHOGONAL, 0, 0, "ascent-orth-6x5-t" },
    { 6, 5, DIFF_HARD,   MODE_ORTHOGONAL, 0, 0, "ascent-orth-6x5-h" },

    /* Hexagon (odd h, w > h/2) */
    { 5, 5, DIFF_NORMAL, MODE_HEXAGON, 0, 0, "ascent-hex-5x5-n" },
    { 5, 5, DIFF_TRICKY, MODE_HEXAGON, 0, 0, "ascent-hex-5x5-t" },
    { 7, 7, DIFF_NORMAL, MODE_HEXAGON, 0, 0, "ascent-hex-7x7-n" },
    { 7, 7, DIFF_HARD,   MODE_HEXAGON, 0, 0, "ascent-hex-7x7-h" },

    /* Honeycomb */
    { 6, 5, DIFF_NORMAL, MODE_HONEYCOMB, 0, 0, "ascent-honey-6x5-n" },
    { 7, 6, DIFF_TRICKY, MODE_HONEYCOMB, 0, 0, "ascent-honey-7x6-t" },
    { 7, 6, DIFF_HARD,   MODE_HONEYCOMB, 0, 0, "ascent-honey-7x6-h" },

    /* Edges (diff >= NORMAL, not symmetrical); removeends both ways */
    { 5, 5, DIFF_NORMAL, MODE_EDGES, 1, 0, "ascent-edges-5x5-n-re" },
    { 5, 5, DIFF_TRICKY, MODE_EDGES, 1, 0, "ascent-edges-5x5-t-re" },
    { 5, 5, DIFF_HARD,   MODE_EDGES, 1, 0, "ascent-edges-5x5-h-re" },
    { 5, 5, DIFF_NORMAL, MODE_EDGES, 0, 0, "ascent-edges-5x5-n-keep" },

    /* Symmetrical + removeends variants (Rectangle) */
    { 6, 5, DIFF_NORMAL, MODE_RECT, 0, 1, "ascent-rect-6x5-n-sym" },
    { 6, 6, DIFF_HARD,   MODE_RECT, 0, 1, "ascent-rect-6x6-h-sym" },
    { 5, 5, DIFF_NORMAL, MODE_RECT, 1, 0, "ascent-rect-5x5-n-re" },
};

int main(void)
{
    FILE *out = stdout;
    int n = (int)(sizeof CASES / sizeof *CASES);

    fputs("{\n  \"version\": 1,\n  \"fixtures\": [\n", out);
    for (int i = 0; i < n; i++) {
        const trace_case *c = &CASES[i];
        game_params params;
        params.w = c->w;
        params.h = c->h;
        params.diff = c->diff;
        params.mode = c->mode;
        params.removeends = c->removeends;
        params.symmetrical = c->symmetrical;

        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        char *desc = new_game_desc(&params, rs, &aux, false);

        fprintf(out,
                "    { \"w\": %d, \"h\": %d, \"diff\": %d, \"mode\": %d, "
                "\"removeends\": %s, \"symmetrical\": %s, "
                "\"seed\": \"%s\", \"desc\": \"%s\" }%s\n",
                c->w, c->h, c->diff, c->mode,
                c->removeends ? "true" : "false",
                c->symmetrical ? "true" : "false",
                c->seed, desc,
                (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
