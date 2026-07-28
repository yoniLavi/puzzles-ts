/*
 * boats-trace.c: C-reference fixture generator for the Boats TS port
 * (openspec add-boats-ts-port).
 *
 * Includes unreleased/boats.c directly (its generator and solver are static)
 * and, for a curated set of (params, seed) tuples spanning every preset plus a
 * fleet/size sweep and both remove-numbers states, generates a board with the
 * upstream generator and emits the description as JSON. The TS port replays the
 * same (params, seed) through `newBoatsDesc` and asserts byte-for-byte
 * equality.
 *
 * That single assertion is unusually strong. `new_game_desc` is solver-gated at
 * every step: it adds a random grid clue only while the Easy solver is stuck,
 * then removes each grid clue only while `boats_solve_game(state, diff)` still
 * solves, then (for a strip puzzle) removes each border number under the same
 * test, and finally rejects the whole board unless it solves at *exactly* the
 * target difficulty. So the published desc depends on the solver's verdict on
 * every intermediate board — generator, all four solver tiers, the dsf root
 * choice and the codec are validated together (design D6).
 *
 * Each case also carries the wall-clock milliseconds the C took, so the port's
 * own cost can be compared against upstream's rather than guessed at.
 *
 * Build (needs the real random.c, so the pure-C config):
 *   rm -rf build/native
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make boats-trace)
 *   build/native/auxiliary/boats-trace \
 *     > src/native/games/boats/__fixtures__/boats-c-reference.json
 *
 * boats.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "../unreleased/boats.c"

typedef struct {
    int w, h, fleet, diff;
    bool strip;
    /* NULL = the default size-1 x fleet ... size-fleet x 1 pyramid. */
    const char *fleetcfg;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* The twelve upstream presets, default fleet, no stripping. */
    {  6,  6, 3, DIFF_EASY,   false, NULL, "boats-6x6f3-e" },
    {  6,  6, 3, DIFF_NORMAL, false, NULL, "boats-6x6f3-n" },
    {  6,  6, 3, DIFF_HARD,   false, NULL, "boats-6x6f3-h" },
    {  8,  8, 4, DIFF_EASY,   false, NULL, "boats-8x8f4-e" },
    {  8,  8, 4, DIFF_NORMAL, false, NULL, "boats-8x8f4-n" },
    {  8,  8, 4, DIFF_HARD,   false, NULL, "boats-8x8f4-h" },
    { 10, 10, 4, DIFF_EASY,   false, NULL, "boats-10x10f4-e" },
    { 10, 10, 4, DIFF_NORMAL, false, NULL, "boats-10x10f4-n" },
    { 10, 10, 4, DIFF_TRICKY, false, NULL, "boats-10x10f4-t" },
    { 10, 10, 4, DIFF_HARD,   false, NULL, "boats-10x10f4-h" },
    { 10, 12, 5, DIFF_TRICKY, false, NULL, "boats-10x12f5-t" },
    { 10, 12, 5, DIFF_HARD,   false, NULL, "boats-10x12f5-h" },

    /* A second seed per preset size, to catch a divergence only one
     * generation path reaches. */
    {  6,  6, 3, DIFF_NORMAL, false, NULL, "boats-6x6f3-n-2" },
    {  8,  8, 4, DIFF_HARD,   false, NULL, "boats-8x8f4-h-2" },
    { 10, 10, 4, DIFF_TRICKY, false, NULL, "boats-10x10f4-t-2" },

    /* Remove-numbers (strip) on, at every difficulty that supports the
     * border-clue deductions (Tricky is where boats_solver_borderclues_*
     * first runs, but Easy/Normal must still generate). */
    {  6,  6, 3, DIFF_EASY,   true,  NULL, "boats-6x6f3-e-S" },
    {  6,  6, 3, DIFF_NORMAL, true,  NULL, "boats-6x6f3-n-S" },
    {  6,  6, 3, DIFF_TRICKY, true,  NULL, "boats-6x6f3-t-S" },
    {  6,  6, 3, DIFF_HARD,   true,  NULL, "boats-6x6f3-h-S" },
    {  8,  8, 4, DIFF_TRICKY, true,  NULL, "boats-8x8f4-t-S" },
    {  8,  8, 4, DIFF_HARD,   true,  NULL, "boats-8x8f4-h-S" },
    { 10, 10, 4, DIFF_TRICKY, true,  NULL, "boats-10x10f4-t-S" },

    /* Size sweep, including non-square boards in both orientations (the
     * border-clue block runs columns then rows, so w != h is a distinct
     * codec path) and the smallest legal boards. Every entry here is one
     * `validate_params` accepts: upstream's `new_game_desc` retries fleet
     * placement in an *unbounded* loop, so an unfittable fleet (e.g. the
     * default 3,2,1 in 5x4) hangs for ever rather than failing. The fit
     * test in `validate_params` is the only guard — see design F1. */
    {  4,  4, 2, DIFF_EASY,   false, NULL, "boats-4x4f2-e" },
    {  4,  4, 2, DIFF_NORMAL, false, NULL, "boats-4x4f2-n" },
    {  5,  4, 2, DIFF_EASY,   false, NULL, "boats-5x4f2-e" },
    {  4,  5, 2, DIFF_EASY,   false, NULL, "boats-4x5f2-e" },
    {  7,  5, 3, DIFF_NORMAL, false, NULL, "boats-7x5f3-n" },
    {  5,  7, 3, DIFF_NORMAL, false, NULL, "boats-5x7f3-n" },
    {  9,  6, 4, DIFF_TRICKY, false, NULL, "boats-9x6f4-t" },
    {  6,  9, 4, DIFF_TRICKY, false, NULL, "boats-6x9f4-t" },
    {  9,  9, 4, DIFF_HARD,   false, NULL, "boats-9x9f4-h" },

    /* Fleet sweep: a single-size fleet, a fleet with a hole (no size-2
     * boats), and a flat fleet rather than the default pyramid. */
    {  6,  6, 1, DIFF_EASY,   false, "4",     "boats-6x6f1-e" },
    {  7,  7, 3, DIFF_NORMAL, false, "3,0,1", "boats-7x7f3-gap-n" },
    {  8,  8, 3, DIFF_NORMAL, false, "2,2,2", "boats-8x8f3-flat-n" },
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
        char *fleetstr;

        params.w = c->w;
        params.h = c->h;
        params.fleet = c->fleet;
        params.diff = c->diff;
        params.strip = c->strip;
        params.fleetdata = c->fleetcfg
            ? boats_decode_fleet(c->fleetcfg, c->fleet)
            : boats_default_fleet(c->fleet);

        fleetstr = boats_encode_fleet(params.fleetdata, params.fleet);

        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        clock_gettime(CLOCK_MONOTONIC, &t0);
        char *desc = new_game_desc(&params, rs, &aux, false);
        clock_gettime(CLOCK_MONOTONIC, &t1);

        fprintf(out,
                "    { \"w\": %d, \"h\": %d, \"fleet\": %d, \"diff\": %d, "
                "\"strip\": %s, \"fleetdata\": \"%s\", "
                "\"seed\": \"%s\", \"desc\": \"%s\", \"genMs\": %ld }%s\n",
                c->w, c->h, c->fleet, c->diff, c->strip ? "true" : "false",
                fleetstr, c->seed, desc, elapsed_ms(t0, t1),
                (i + 1 < n) ? "," : "");
        fflush(out);

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
        sfree(fleetstr);
        sfree(params.fleetdata);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
