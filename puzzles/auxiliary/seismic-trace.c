/*
 * seismic-trace.c: C-reference fixture generator for the Seismic TS port
 * (openspec add-seismic-ts-port).
 *
 * Includes unreleased/seismic.c directly (its generator and solver are static)
 * and, for a curated set of (params, seed) tuples spanning every preset plus a
 * small size sweep, generates a board with the upstream generator and emits the
 * description as JSON. The TS port replays the same (params, seed) through
 * `newSeismicDesc` and asserts byte-for-byte equality.
 *
 * That single assertion is unusually strong: the generator removes a clue only
 * while the tiered solver still solves the board, and then accepts the result
 * only if it solves at the target difficulty and *not* one tier easier — so the
 * published clue set depends on the solver's verdict on every intermediate
 * board. Generator, solver and codec are all validated together (design D7).
 *
 * Every case also carries the wall-clock milliseconds the C took to generate it,
 * so the port's own cost can be compared against upstream's rather than guessed
 * at: seismic's generator is upstream's documented weak point ("near-zero chance
 * of generating sizes higher than 7x7" — unreleased/docs/seismic.md).
 *
 * Sizes are bounded at 7x7 for exactly that reason. Do not add a larger case:
 * the region-merge stage succeeds about once in 20,000 attempts at 7x7 and
 * rarer still above it, so an 8x8 fixture would not finish.
 *
 * Build (needs the real random.c, so the pure-C config):
 *   rm -rf build/native
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make seismic-trace)
 *   build/native/auxiliary/seismic-trace \
 *     > src/native/games/seismic/__fixtures__/seismic-c-reference.json
 *
 * seismic.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "../unreleased/seismic.c"

typedef struct {
    int w, h, diff, mode;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* The twelve upstream presets. */
    { 4, 4, DIFF_EASY, MODE_SEISMIC,  "seismic-4x4-e-s" },
    { 4, 4, DIFF_EASY, MODE_TECTONIC, "seismic-4x4-e-t" },
    { 4, 4, DIFF_HARD, MODE_SEISMIC,  "seismic-4x4-h-s" },
    { 4, 4, DIFF_HARD, MODE_TECTONIC, "seismic-4x4-h-t" },
    { 6, 6, DIFF_EASY, MODE_SEISMIC,  "seismic-6x6-e-s" },
    { 6, 6, DIFF_EASY, MODE_TECTONIC, "seismic-6x6-e-t" },
    { 6, 6, DIFF_HARD, MODE_SEISMIC,  "seismic-6x6-h-s" },
    { 6, 6, DIFF_HARD, MODE_TECTONIC, "seismic-6x6-h-t" },
    { 7, 7, DIFF_EASY, MODE_SEISMIC,  "seismic-7x7-e-s" },
    { 7, 7, DIFF_EASY, MODE_TECTONIC, "seismic-7x7-e-t" },
    { 7, 7, DIFF_HARD, MODE_SEISMIC,  "seismic-7x7-h-s" },
    { 7, 7, DIFF_HARD, MODE_TECTONIC, "seismic-7x7-h-t" },

    /* A second seed per preset size, to catch a divergence that only one
     * generation path reaches. */
    { 4, 4, DIFF_EASY, MODE_SEISMIC,  "seismic-4x4-e-s-2" },
    { 4, 4, DIFF_HARD, MODE_TECTONIC, "seismic-4x4-h-t-2" },
    { 6, 6, DIFF_EASY, MODE_SEISMIC,  "seismic-6x6-e-s-2" },
    { 6, 6, DIFF_HARD, MODE_TECTONIC, "seismic-6x6-h-t-2" },

    /* Size sweep: the minimum board, and non-square shapes in both modes and
     * both difficulties (the wall run-length codec walks the horizontal
     * borders before the vertical ones, so a non-square grid is a distinct
     * codec path). */
    { 4, 5, DIFF_EASY, MODE_SEISMIC,  "seismic-4x5-e-s" },
    { 5, 4, DIFF_EASY, MODE_TECTONIC, "seismic-5x4-e-t" },
    { 5, 5, DIFF_EASY, MODE_SEISMIC,  "seismic-5x5-e-s" },
    { 5, 5, DIFF_HARD, MODE_SEISMIC,  "seismic-5x5-h-s" },
    { 5, 5, DIFF_EASY, MODE_TECTONIC, "seismic-5x5-e-t" },
    { 5, 5, DIFF_HARD, MODE_TECTONIC, "seismic-5x5-h-t" },
    { 6, 4, DIFF_HARD, MODE_SEISMIC,  "seismic-6x4-h-s" },
    { 4, 6, DIFF_HARD, MODE_TECTONIC, "seismic-4x6-h-t" },
    { 7, 4, DIFF_EASY, MODE_SEISMIC,  "seismic-7x4-e-s" },
    { 4, 7, DIFF_EASY, MODE_TECTONIC, "seismic-4x7-e-t" },
    { 6, 5, DIFF_EASY, MODE_SEISMIC,  "seismic-6x5-e-s" },
    { 5, 6, DIFF_HARD, MODE_TECTONIC, "seismic-5x6-h-t" },
};

static long elapsed_ms(struct timespec a, struct timespec b)
{
    return (b.tv_sec - a.tv_sec) * 1000 + (b.tv_nsec - a.tv_nsec) / 1000000;
}

int main(void)
{
    FILE *out = stdout;
    int n = (int)(sizeof CASES / sizeof *CASES);

    fputs("{\n  \"version\": 1,\n  \"fixtures\": [\n", out);
    for (int i = 0; i < n; i++) {
        const trace_case *c = &CASES[i];
        game_params params;
        struct timespec t0, t1;
        params.w = c->w;
        params.h = c->h;
        params.diff = c->diff;
        params.mode = c->mode;

        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        clock_gettime(CLOCK_MONOTONIC, &t0);
        char *desc = new_game_desc(&params, rs, &aux, false);
        clock_gettime(CLOCK_MONOTONIC, &t1);

        fprintf(out,
                "    { \"w\": %d, \"h\": %d, \"diff\": %d, \"mode\": %d, "
                "\"seed\": \"%s\", \"desc\": \"%s\", \"genMs\": %ld }%s\n",
                c->w, c->h, c->diff, c->mode, c->seed, desc,
                elapsed_ms(t0, t1), (i + 1 < n) ? "," : "");
        fflush(out);

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
