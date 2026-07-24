/*
 * spokes-trace.c: C-reference fixture generator for the Spokes TS port
 * (openspec add-spokes-ts-port).
 *
 * Includes unreleased/spokes.c directly (its generator and solver are static)
 * and, for a curated set of (params, seed) tuples spanning every preset plus a
 * small size sweep, generates a board with the upstream generator and emits
 * the description as JSON. The TS port replays the same (params, seed) through
 * `newSpokesDesc` and asserts byte-for-byte equality.
 *
 * That single assertion is unusually strong here: the generator strips a
 * randomised list of lines and keeps each removal only while the tiered solver
 * still deduces a unique solution, so the published clue digits depend on the
 * solver's verdict on every intermediate board. Generator, solver and codec
 * are therefore all validated together (design D9).
 *
 * Build (needs the real random.c, so the pure-C config):
 *   rm -rf build/native
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make spokes-trace)
 *   build/native/auxiliary/spokes-trace \
 *     > src/native/games/spokes/__fixtures__/spokes-c-reference.json
 *
 * spokes.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../unreleased/spokes.c"

typedef struct {
    int w, h, diff;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* The six upstream presets, each on two seeds. */
    { 4, 4, DIFF_EASY,   "spokes-4x4-e-1" },
    { 4, 4, DIFF_EASY,   "spokes-4x4-e-2" },
    { 4, 4, DIFF_TRICKY, "spokes-4x4-t-1" },
    { 4, 4, DIFF_TRICKY, "spokes-4x4-t-2" },
    { 4, 4, DIFF_HARD,   "spokes-4x4-h-1" },
    { 4, 4, DIFF_HARD,   "spokes-4x4-h-2" },
    { 6, 6, DIFF_EASY,   "spokes-6x6-e-1" },
    { 6, 6, DIFF_EASY,   "spokes-6x6-e-2" },
    { 6, 6, DIFF_TRICKY, "spokes-6x6-t-1" },
    { 6, 6, DIFF_HARD,   "spokes-6x6-h-1" },

    /* Size sweep, including the minimum board and non-square shapes. */
    { 2, 2, DIFF_EASY,   "spokes-2x2-e" },
    { 2, 2, DIFF_TRICKY, "spokes-2x2-t" },
    { 2, 2, DIFF_HARD,   "spokes-2x2-h" },
    { 3, 2, DIFF_EASY,   "spokes-3x2-e" },
    { 2, 5, DIFF_TRICKY, "spokes-2x5-t" },
    { 3, 3, DIFF_EASY,   "spokes-3x3-e" },
    { 3, 3, DIFF_TRICKY, "spokes-3x3-t" },
    { 3, 3, DIFF_HARD,   "spokes-3x3-h" },
    { 5, 3, DIFF_EASY,   "spokes-5x3-e" },
    { 5, 3, DIFF_TRICKY, "spokes-5x3-t" },
    { 3, 5, DIFF_HARD,   "spokes-3x5-h" },
    { 5, 5, DIFF_EASY,   "spokes-5x5-e" },
    { 5, 5, DIFF_TRICKY, "spokes-5x5-t" },
    { 7, 4, DIFF_EASY,   "spokes-7x4-e" },
    { 4, 7, DIFF_TRICKY, "spokes-4x7-t" },
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

        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        char *desc = new_game_desc(&params, rs, &aux, false);

        fprintf(out,
                "    { \"w\": %d, \"h\": %d, \"diff\": %d, "
                "\"seed\": \"%s\", \"desc\": \"%s\" }%s\n",
                c->w, c->h, c->diff, c->seed, desc,
                (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
