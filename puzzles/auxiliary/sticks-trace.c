/*
 * sticks-trace.c: C-reference fixture generator for the Sticks TS port
 * (openspec add-sticks-ts-port).
 *
 * Includes unreleased/sticks.c directly (its functions are static) and, for
 * a curated set of (params, seed) tuples, generates a board with the upstream
 * generator and emits the desc as JSON. The TS port replays the same
 * (params, seed) through its own generator and asserts byte-for-byte equality
 * of the desc — the generator is a faithful port over the bit-identical RNG
 * and gates every fill attempt and clue removal on the contradiction solver,
 * so one byte-match validates the generator, the solver and the run-length
 * codec together.
 *
 * Build (needs the real random.c, so the pure-C config):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make sticks-trace)
 *   build/native/auxiliary/sticks-trace \
 *     > src/native/games/sticks/__fixtures__/sticks-c-reference.json
 *
 * sticks.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../unreleased/sticks.c"

typedef struct {
    int w, h, blackpc, symm;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* both presets, two seeds each */
    { 7, 7, 20, SYMM_ROT2, "sticks-trace-7x7-a" },
    { 7, 7, 20, SYMM_ROT2, "sticks-trace-7x7-b" },
    { 10, 10, 20, SYMM_ROT2, "sticks-trace-10x10-a" },
    { 10, 10, 20, SYMM_ROT2, "sticks-trace-10x10-b" },
    /* every symmetry type */
    { 5, 5, 20, SYMM_NONE, "sticks-trace-5x5-none" },
    { 6, 4, 30, SYMM_REF2, "sticks-trace-6x4-ref2" },
    { 8, 6, 20, SYMM_ROT2, "sticks-trace-8x6-rot2" },
    { 7, 7, 20, SYMM_REF4, "sticks-trace-7x7-ref4" },
    { 7, 7, 20, SYMM_ROT4, "sticks-trace-7x7-rot4" }, /* odd centre fix-up */
    { 8, 8, 50, SYMM_ROT4, "sticks-trace-8x8-rot4" },
    /* blackpc sweep + small/odd sizes */
    { 5, 5, 60, SYMM_NONE, "sticks-trace-5x5-b60" },
    { 4, 4, 20, SYMM_ROT2, "sticks-trace-4x4-a" },
    { 12, 5, 25, SYMM_NONE, "sticks-trace-12x5-a" },
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
        params.blackpc = c->blackpc;
        params.symm = c->symm;

        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        char *desc = new_game_desc(&params, rs, &aux, false);

        fprintf(out,
                "    { \"w\": %d, \"h\": %d, \"blackpc\": %d, \"symm\": %d, "
                "\"seed\": \"%s\", \"desc\": \"%s\" }%s\n",
                c->w, c->h, c->blackpc, c->symm, c->seed, desc,
                (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
