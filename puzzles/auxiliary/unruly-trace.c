/*
 * unruly-trace.c: C-reference fixture generator for the Unruly TS port
 * (openspec add-unruly-ts-port).
 *
 * Includes unruly.c directly (its functions are static) and, for a curated
 * set of (params, seed) pairs, generates a board with the upstream
 * generator and emits the desc + the solver's max difficulty as JSON.
 * The TS port replays the same (params, seed) through its own generator
 * and asserts byte-for-byte equality of the desc (the generator is a
 * faithful port over the bit-identical RNG), plus that its solver solves
 * the board.
 *
 * Build (needs the real random.c, so the pure-C config):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make unruly-trace)
 *   build/native/auxiliary/unruly-trace \
 *     > src/native/games/unruly/__fixtures__/unruly-c-reference.json
 *
 * unruly.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../unruly.c"

typedef struct {
    int w2, h2;
    int unique;
    int diff;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    { 8, 8, 0, DIFF_TRIVIAL, "unruly-trace-0" },
    { 8, 8, 0, DIFF_EASY, "unruly-trace-1" },
    { 8, 8, 0, DIFF_NORMAL, "unruly-trace-2" },
    { 10, 10, 0, DIFF_EASY, "unruly-trace-3" },
    { 10, 10, 0, DIFF_NORMAL, "unruly-trace-4" },
    { 14, 14, 0, DIFF_NORMAL, "unruly-trace-5" },
    { 8, 8, 1, DIFF_EASY, "unruly-trace-6" },
    { 8, 8, 1, DIFF_NORMAL, "unruly-trace-7" },
};

int main(void)
{
    FILE *out = stdout;
    int n = (int)(sizeof CASES / sizeof *CASES);

    fputs("{\n  \"version\": 1,\n  \"fixtures\": [\n", out);
    for (int i = 0; i < n; i++) {
        const trace_case *c = &CASES[i];
        game_params params;
        params.w2 = c->w2;
        params.h2 = c->h2;
        params.unique = c->unique;
        params.diff = c->diff;

        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        char *desc = new_game_desc(&params, rs, &aux, false);

        /* Solve the generated board to record the max difficulty used. */
        game_state *state = new_game(NULL, &params, desc);
        struct unruly_scratch *scratch = unruly_new_scratch(state);
        int maxdiff = unruly_solve_game(state, scratch, DIFFCOUNT);

        fprintf(out,
                "    { \"w2\": %d, \"h2\": %d, \"unique\": %s, \"diff\": %d, "
                "\"seed\": \"%s\", \"desc\": \"%s\", \"solverDiff\": %d }%s\n",
                c->w2, c->h2, c->unique ? "true" : "false", c->diff, c->seed,
                desc, maxdiff, (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        unruly_free_scratch(scratch);
        free_game(state);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
