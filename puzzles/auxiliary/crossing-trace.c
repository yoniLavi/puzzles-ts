/*
 * crossing-trace.c: C-reference fixture generator for the Crossing TS port
 * (openspec add-crossing-ts-port).
 *
 * Includes unreleased/crossing.c directly (its generator and solver are static)
 * and, for a curated set of (params, seed) tuples spanning every preset, a size
 * sweep and both symmetric-wall arms, generates a board with the upstream
 * generator and emits the description as JSON. The TS port replays the same
 * (params, seed) through `newCrossingDesc` and asserts byte-for-byte equality.
 *
 * That single assertion is unusually strong here: generation retries until the
 * deductive solver reaches a complete unique answer, so the published walls and
 * number list depend on the solver's verdict on every candidate board.
 * Generator, solver and codec are therefore validated together (design D7).
 *
 * Build (needs the real random.c, so the pure-C config):
 *   rm -rf build/native
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make crossing-trace)
 *   build/native/auxiliary/crossing-trace \
 *     > src/native/games/crossing/__fixtures__/crossing-c-reference.json
 *
 * crossing.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../unreleased/crossing.c"

typedef struct {
    int w, h;
    bool sym;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* The three upstream presets, each on several seeds. */
    { 5, 5, false, "crossing-5x5-1" },
    { 5, 5, false, "crossing-5x5-2" },
    { 5, 5, false, "crossing-5x5-3" },
    { 7, 7, false, "crossing-7x7-1" },
    { 7, 7, false, "crossing-7x7-2" },
    { 7, 7, false, "crossing-7x7-3" },
    { 9, 9, false, "crossing-9x9-1" },
    { 9, 9, false, "crossing-9x9-2" },

    /* Symmetric walls: a distinct branch of the wall-growth loop. */
    { 5, 5, true, "crossing-5x5-S-1" },
    { 5, 5, true, "crossing-5x5-S-2" },
    { 7, 7, true, "crossing-7x7-S-1" },
    { 6, 4, true, "crossing-6x4-S-1" },
    { 9, 9, true, "crossing-9x9-S-1" },

    /* Size sweep, including the minimum legal boards and non-square shapes. */
    { 4, 2, false, "crossing-4x2-1" },
    { 2, 4, false, "crossing-2x4-1" },
    { 4, 3, false, "crossing-4x3-1" },
    { 4, 4, false, "crossing-4x4-1" },
    { 4, 4, false, "crossing-4x4-2" },
    { 6, 4, false, "crossing-6x4-1" },
    { 4, 6, false, "crossing-4x6-1" },
    { 6, 6, false, "crossing-6x6-1" },
    { 8, 5, false, "crossing-8x5-1" },
    { 5, 8, false, "crossing-5x8-1" },
    { 10, 7, false, "crossing-10x7-1" },
    { 7, 10, false, "crossing-7x10-1" },
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
        params.sym = c->sym;

        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        char *desc = new_game_desc(&params, rs, &aux, false);

        fprintf(out,
                "    { \"w\": %d, \"h\": %d, \"sym\": %s, "
                "\"seed\": \"%s\", \"desc\": \"%s\" }%s\n",
                c->w, c->h, c->sym ? "true" : "false", c->seed, desc,
                (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
