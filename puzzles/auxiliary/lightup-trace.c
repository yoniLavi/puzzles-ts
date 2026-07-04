/*
 * lightup-trace.c: C-reference fixture generator for the Light Up TS
 * port (openspec add-lightup-ts-port).
 *
 * Includes lightup.c directly (its functions are static) and, for a
 * curated set of (params, seed) pairs, generates a board with the
 * upstream generator and emits the desc as JSON. The TS port replays
 * the same (params, seed) through its own generator and asserts
 * byte-for-byte equality of the desc (the generator is a faithful port
 * over the bit-identical RNG).
 *
 * Build (needs the real random.c, so the pure-C config):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make lightup-trace)
 *   build/native/auxiliary/lightup-trace \
 *     > src/native/games/lightup/__fixtures__/lightup-c-reference.json
 *
 * lightup.c is deleted when the port ships at owner-confirmed parity;
 * this harness goes with it (the fixture stays committed as the gated
 * check's baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../lightup.c"

typedef struct {
    int w, h;
    int blackpc;
    int symm;
    int difficulty;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* The nine upstream presets. */
    { 7, 7, 20, SYMM_ROT4, 0, "lightup-trace-0" },
    { 7, 7, 20, SYMM_ROT4, 1, "lightup-trace-1" },
    { 7, 7, 20, SYMM_ROT4, 2, "lightup-trace-2" },
    { 10, 10, 20, SYMM_ROT2, 0, "lightup-trace-3" },
    { 10, 10, 20, SYMM_ROT2, 1, "lightup-trace-4" },
    { 10, 10, 20, SYMM_ROT2, 2, "lightup-trace-5" },
    { 14, 14, 20, SYMM_ROT2, 0, "lightup-trace-6" },
    { 14, 14, 20, SYMM_ROT2, 1, "lightup-trace-7" },
    { 14, 14, 20, SYMM_ROT2, 2, "lightup-trace-8" },
    /* Non-default symmetry / black percentage / rectangular grids. */
    { 10, 8, 25, SYMM_REF2, 1, "lightup-trace-9" },
    { 9, 9, 30, SYMM_NONE, 2, "lightup-trace-10" },
    { 11, 11, 20, SYMM_REF4, 0, "lightup-trace-11" },
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
        params.difficulty = c->difficulty;

        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        char *desc = new_game_desc(&params, rs, &aux, false);

        fprintf(out,
                "    { \"w\": %d, \"h\": %d, \"blackpc\": %d, \"symm\": %d, "
                "\"difficulty\": %d, \"seed\": \"%s\", \"desc\": \"%s\" }%s\n",
                c->w, c->h, c->blackpc, c->symm, c->difficulty, c->seed,
                desc, (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
