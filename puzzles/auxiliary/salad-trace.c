/*
 * salad-trace.c: C-reference fixture generator for the Salad TS port
 * (openspec add-salad-ts-port).
 *
 * Includes salad.c directly (its generator and solver are static) and, for a
 * curated set of (params, seed) tuples spanning both game modes, both
 * difficulties and every preset, generates a board with the upstream generator
 * and emits the description as JSON, plus the minimal difficulty at which the
 * upstream solver solves it and the wall-clock the generation took.
 *
 * The TS port replays the same (params, seed) through its own generator and
 * asserts byte-for-byte equality of the desc. Because the generator is
 * solver-gated at every clue removal, that single assertion validates the
 * generator, the solver and the codec together over the bit-identical
 * random.ts (playbook §4.4).
 *
 * Build (needs the real random.c, so the pure-C config):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make salad-trace)
 *   build/native/auxiliary/salad-trace \
 *     > src/native/games/salad/__fixtures__/salad-c-reference.json
 *
 * salad.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "../unreleased/salad.c"

typedef struct {
    int order;
    int nums;
    int mode;
    int diff;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* Every upstream preset, at both difficulties. */
    { 4, 3, GAMEMODE_LETTERS, DIFF_EASY, "salad-trace-0" },
    { 4, 3, GAMEMODE_LETTERS, DIFF_HARD, "salad-trace-1" },
    { 5, 3, GAMEMODE_LETTERS, DIFF_EASY, "salad-trace-2" },
    { 5, 3, GAMEMODE_LETTERS, DIFF_HARD, "salad-trace-3" },
    { 5, 3, GAMEMODE_NUMBERS, DIFF_EASY, "salad-trace-4" },
    { 5, 3, GAMEMODE_NUMBERS, DIFF_HARD, "salad-trace-5" },
    { 5, 4, GAMEMODE_LETTERS, DIFF_EASY, "salad-trace-6" },
    { 5, 4, GAMEMODE_LETTERS, DIFF_HARD, "salad-trace-7" },
    { 6, 3, GAMEMODE_NUMBERS, DIFF_EASY, "salad-trace-8" },
    { 6, 3, GAMEMODE_NUMBERS, DIFF_HARD, "salad-trace-9" },
    { 6, 4, GAMEMODE_LETTERS, DIFF_EASY, "salad-trace-10" },
    { 6, 4, GAMEMODE_LETTERS, DIFF_HARD, "salad-trace-11" },
    { 6, 4, GAMEMODE_NUMBERS, DIFF_EASY, "salad-trace-12" },
    { 6, 4, GAMEMODE_NUMBERS, DIFF_HARD, "salad-trace-13" },
    { 7, 4, GAMEMODE_LETTERS, DIFF_EASY, "salad-trace-14" },
    { 7, 4, GAMEMODE_LETTERS, DIFF_HARD, "salad-trace-15" },
    { 7, 4, GAMEMODE_NUMBERS, DIFF_EASY, "salad-trace-16" },
    { 7, 4, GAMEMODE_NUMBERS, DIFF_HARD, "salad-trace-17" },
    { 8, 5, GAMEMODE_LETTERS, DIFF_EASY, "salad-trace-18" },
    { 8, 5, GAMEMODE_LETTERS, DIFF_HARD, "salad-trace-19" },
    { 8, 5, GAMEMODE_NUMBERS, DIFF_EASY, "salad-trace-20" },
    { 8, 5, GAMEMODE_NUMBERS, DIFF_HARD, "salad-trace-21" },

    /*
     * A size / symbol-count sweep beyond the presets. 3x3 is the smallest
     * legal board; 8x8 letters is the boundary where the generator stops
     * forcing an empty grid (o < 8), so 8 and 9 exercise the clue-stripping
     * path the presets below 8 never reach; 9n8 is the densest legal board.
     */
    { 3, 2, GAMEMODE_LETTERS, DIFF_EASY, "salad-trace-22" },
    { 3, 2, GAMEMODE_NUMBERS, DIFF_EASY, "salad-trace-23" },
    { 4, 2, GAMEMODE_NUMBERS, DIFF_HARD, "salad-trace-24" },
    { 7, 6, GAMEMODE_LETTERS, DIFF_EASY, "salad-trace-25" },
    { 9, 5, GAMEMODE_LETTERS, DIFF_EASY, "salad-trace-26" },
    { 9, 8, GAMEMODE_NUMBERS, DIFF_HARD, "salad-trace-27" },
};

/* Minimal difficulty at which the upstream solver solves the board. */
static int grade(const game_params *params, const char *desc)
{
    int d;
    for (d = 0; d < 2; d++) {
        const char *fail = NULL;
        game_state *st = load_game(params, desc, &fail);
        int ok;
        if (!st) return -2;
        ok = salad_solve(st, d);
        free_game(st);
        if (ok) return d;
    }
    return -1;
}

int main(void)
{
    FILE *out = stdout;
    int n = (int)(sizeof CASES / sizeof *CASES);
    int i;

    fputs("{\n  \"version\": 1,\n  \"fixtures\": [\n", out);
    for (i = 0; i < n; i++) {
        const trace_case *c = &CASES[i];
        game_params params;
        random_state *rs;
        char *aux = NULL;
        char *desc;
        struct timespec t0, t1;
        double gen_ms;
        int solver_diff;

        params.order = c->order;
        params.nums = c->nums;
        params.mode = c->mode;
        params.diff = c->diff;

        rs = random_new(c->seed, (int)strlen(c->seed));
        clock_gettime(CLOCK_MONOTONIC, &t0);
        desc = new_game_desc(&params, rs, &aux, false);
        clock_gettime(CLOCK_MONOTONIC, &t1);
        gen_ms = (t1.tv_sec - t0.tv_sec) * 1000.0 +
                 (t1.tv_nsec - t0.tv_nsec) / 1000000.0;

        solver_diff = grade(&params, desc);

        fprintf(out,
                "    { \"order\": %d, \"nums\": %d, \"mode\": %d, \"diff\": %d, "
                "\"seed\": \"%s\", \"desc\": \"%s\", \"solverDiff\": %d, "
                "\"genMs\": %.1f }%s\n",
                c->order, c->nums, c->mode, c->diff, c->seed, desc, solver_diff,
                gen_ms, (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
