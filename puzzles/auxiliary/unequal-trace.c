/*
 * unequal-trace.c: C-reference fixture generator for the Unequal TS port
 * (openspec add-unequal-ts-port).
 *
 * Includes unequal.c directly (its functions are static) and, for a curated
 * set of (params, seed) pairs across both modes and several difficulties,
 * generates a board with the upstream generator and emits the desc + the
 * minimal solving difficulty as JSON. The TS port replays the same
 * (params, seed) through its own generator and asserts byte-for-byte equality
 * of the desc (the generator is a faithful port over the bit-identical RNG),
 * plus that its solver grades the board at the same difficulty.
 *
 * Build (needs the real random.c, so the pure-C config):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make unequal-trace)
 *   build/native/auxiliary/unequal-trace \
 *     > src/native/games/unequal/__fixtures__/unequal-c-reference.json
 *
 * unequal.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../unequal.c"

typedef struct {
    int order;
    int diff;
    int mode;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    { 4, DIFF_EASY,    MODE_UNEQUAL,  "unequal-trace-0" },
    { 5, DIFF_LATIN,   MODE_UNEQUAL,  "unequal-trace-1" },
    { 5, DIFF_EASY,    MODE_UNEQUAL,  "unequal-trace-2" },
    { 5, DIFF_SET,     MODE_UNEQUAL,  "unequal-trace-3" },
    { 5, DIFF_SET,     MODE_ADJACENT, "unequal-trace-4" },
    { 5, DIFF_EXTREME, MODE_UNEQUAL,  "unequal-trace-5" },
    { 6, DIFF_SET,     MODE_UNEQUAL,  "unequal-trace-6" },
    { 6, DIFF_SET,     MODE_ADJACENT, "unequal-trace-7" },
    { 6, DIFF_EXTREME, MODE_UNEQUAL,  "unequal-trace-8" },
    { 7, DIFF_SET,     MODE_ADJACENT, "unequal-trace-9" },
};

/* Minimal difficulty at which the upstream solver solves the board. */
static int grade(const game_params *params, const char *desc)
{
    int o2 = params->order * params->order;
    for (int d = 0; d < DIFFCOUNT; d++) {
        game_state *st = new_game(NULL, params, desc);
        for (int r = 0; r < o2; r++)
            if (!(st->flags[r] & F_IMMUTABLE)) st->nums[r] = 0;
        int ok = solver_state(st, d);
        free_game(st);
        if (ok == 1) return d;
    }
    return -1;
}

int main(void)
{
    FILE *out = stdout;
    int n = (int)(sizeof CASES / sizeof *CASES);

    fputs("{\n  \"version\": 1,\n  \"fixtures\": [\n", out);
    for (int i = 0; i < n; i++) {
        const trace_case *c = &CASES[i];
        game_params params;
        params.order = c->order;
        params.diff = c->diff;
        params.mode = c->mode;

        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        char *desc = new_game_desc(&params, rs, &aux, false);

        int solverDiff = grade(&params, desc);

        fprintf(out,
                "    { \"order\": %d, \"diff\": %d, \"mode\": %d, "
                "\"seed\": \"%s\", \"desc\": \"%s\", \"solverDiff\": %d }%s\n",
                c->order, c->diff, c->mode, c->seed, desc, solverDiff,
                (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
