/*
 * rome-trace.c: C-reference fixture generator for the Rome TS port
 * (openspec add-rome-ts-port).
 *
 * Includes rome.c directly (its generator and solver are static) and, for a
 * curated set of (params, seed) tuples spanning every preset plus a size
 * sweep, generates a board with the upstream generator and emits the
 * description as JSON, plus the minimal difficulty at which the upstream
 * solver solves it and the wall-clock the generation took.
 *
 * The TS port replays the same (params, seed) through its own generator and
 * asserts byte-for-byte equality of the desc. Because generation is
 * solver-gated at every clue removal *and* gated out of the tier below, that
 * single assertion validates the generator, all eight solver deductions, the
 * two disjoint-set forests and the codec together over the bit-identical
 * random.ts (playbook §4.4).
 *
 * Build (needs the real random.c, so the pure-C config):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make rome-trace)
 *   build/native/auxiliary/rome-trace \
 *     > src/native/games/rome/__fixtures__/rome-c-reference.json
 *
 * rome.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "../unreleased/rome.c"

typedef struct {
    int w;
    int h;
    int diff;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* Every upstream preset. */
    { 4, 4, DIFF_EASY, "rome-trace-0" },
    { 4, 4, DIFF_NORMAL, "rome-trace-1" },
    { 4, 4, DIFF_TRICKY, "rome-trace-2" },
    { 6, 6, DIFF_EASY, "rome-trace-3" },
    { 6, 6, DIFF_NORMAL, "rome-trace-4" },
    { 6, 6, DIFF_TRICKY, "rome-trace-5" },
    { 8, 8, DIFF_EASY, "rome-trace-6" },
    { 8, 8, DIFF_NORMAL, "rome-trace-7" },
    { 8, 8, DIFF_TRICKY, "rome-trace-8" },
    { 10, 10, DIFF_EASY, "rome-trace-9" },
    { 10, 10, DIFF_NORMAL, "rome-trace-10" },
    { 10, 10, DIFF_TRICKY, "rome-trace-11" },

    /*
     * A size sweep beyond the presets. 3x3 is the smallest legal board (and
     * the one where a goal eats a large share of the grid); the oblong sizes
     * exercise the wall list's horizontal/vertical split, which a square board
     * cannot distinguish; 12x12 pushes past the largest preset.
     */
    { 3, 3, DIFF_EASY, "rome-trace-12" },
    { 3, 3, DIFF_NORMAL, "rome-trace-13" },
    { 3, 3, DIFF_TRICKY, "rome-trace-14" },
    { 3, 5, DIFF_EASY, "rome-trace-15" },
    { 5, 3, DIFF_EASY, "rome-trace-16" },
    { 3, 7, DIFF_TRICKY, "rome-trace-17" },
    { 7, 3, DIFF_TRICKY, "rome-trace-18" },
    { 4, 7, DIFF_NORMAL, "rome-trace-19" },
    { 7, 4, DIFF_NORMAL, "rome-trace-20" },
    { 5, 5, DIFF_EASY, "rome-trace-21" },
    { 9, 6, DIFF_NORMAL, "rome-trace-22" },
    { 6, 9, DIFF_TRICKY, "rome-trace-23" },
    { 12, 12, DIFF_EASY, "rome-trace-24" },
    { 12, 12, DIFF_TRICKY, "rome-trace-25" },
};

/* Minimal difficulty at which the upstream solver solves the board. */
static int grade(const game_params *params, const char *desc)
{
    int d;
    for (d = 0; d < DIFFCOUNT; d++) {
        game_state *st = NULL;
        char status;
        if (rome_read_desc(params, desc, &st) != VALID) {
            if (st) free_game(st);
            return -2;
        }
        status = rome_solve(st, d);
        free_game(st);
        if (status == STATUS_COMPLETE) return d;
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

        params.w = c->w;
        params.h = c->h;
        params.diff = c->diff;

        rs = random_new(c->seed, (int)strlen(c->seed));
        clock_gettime(CLOCK_MONOTONIC, &t0);
        desc = new_game_desc(&params, rs, &aux, false);
        clock_gettime(CLOCK_MONOTONIC, &t1);
        gen_ms = (t1.tv_sec - t0.tv_sec) * 1000.0 +
                 (t1.tv_nsec - t0.tv_nsec) / 1000000.0;

        solver_diff = grade(&params, desc);

        fprintf(out,
                "    { \"w\": %d, \"h\": %d, \"diff\": %d, \"seed\": \"%s\", "
                "\"desc\": \"%s\", \"solverDiff\": %d, \"genMs\": %.1f }%s\n",
                c->w, c->h, c->diff, c->seed, desc, solver_diff, gen_ms,
                (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
