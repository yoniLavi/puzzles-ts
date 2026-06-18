/*
 * filling-trace.c: C-reference fixture generator for the Filling (Fillomino)
 * TS port (openspec add-filling-ts-port).
 *
 * Includes filling.c directly (its generator functions are static) and, for a
 * curated set of (params, seed) pairs, generates a board with the upstream
 * generator and emits the desc as JSON. The TS port replays the same
 * (params, seed) through its own generator and asserts byte-for-byte equality
 * of the desc (the generator is a faithful port over the bit-identical RNG),
 * plus that its solver solves the board.
 *
 * Build (needs the real random.c, so the pure-C config):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make filling-trace)
 *   build/native/auxiliary/filling-trace \
 *     > src/native/games/filling/__fixtures__/filling-c-reference.json
 *
 * filling.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../filling.c"

typedef struct {
    int w, h;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    { 9, 7, "filling-9x7-0" },
    { 9, 7, "filling-9x7-1" },
    { 9, 7, "filling-9x7-2" },
    { 9, 7, "filling-9x7-3" },
    { 13, 9, "filling-13x9-0" },
    { 13, 9, "filling-13x9-1" },
    { 13, 9, "filling-13x9-2" },
    { 13, 9, "filling-13x9-3" },
    { 17, 13, "filling-17x13-0" },
    { 17, 13, "filling-17x13-1" },
    { 17, 13, "filling-17x13-2" },
    { 17, 13, "filling-17x13-3" },
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

        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        char *desc = new_game_desc(&params, rs, &aux, false);

        fprintf(out,
                "    { \"w\": %d, \"h\": %d, \"seed\": \"%s\", \"desc\": \"%s\" }%s\n",
                c->w, c->h, c->seed, desc, (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
