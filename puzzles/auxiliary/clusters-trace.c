/*
 * clusters-trace.c: C-reference fixture generator for the Clusters TS port
 * (openspec add-clusters-ts-port).
 *
 * Includes unreleased/clusters.c directly (its functions are static) and, for
 * a curated set of (params, seed) tuples, generates a board with the upstream
 * generator and emits the desc as JSON. The TS port replays the same
 * (params, seed) through its own generator and asserts byte-for-byte equality
 * of the desc — the generator is a faithful port over the bit-identical RNG,
 * so one byte-match validates the generator, the contradiction solver and the
 * run-length codec together.
 *
 * Build (needs the real random.c, so the pure-C config):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make clusters-trace)
 *   build/native/auxiliary/clusters-trace \
 *     > src/native/games/clusters/__fixtures__/clusters-c-reference.json
 *
 * clusters.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../unreleased/clusters.c"

typedef struct {
    int w, h;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* every preset */
    { 7, 7, "clusters-trace-7x7-a" },
    { 7, 7, "clusters-trace-7x7-b" },
    { 8, 8, "clusters-trace-8x8-a" },
    { 8, 8, "clusters-trace-8x8-b" },
    { 9, 9, "clusters-trace-9x9-a" },
    { 9, 9, "clusters-trace-9x9-b" },
    { 10, 10, "clusters-trace-10x10-a" },
    { 10, 10, "clusters-trace-10x10-b" },
    /* a size sweep, incl. non-square */
    { 5, 5, "clusters-trace-5x5-a" },
    { 6, 9, "clusters-trace-6x9-a" },
    { 12, 8, "clusters-trace-12x8-a" },
    { 4, 4, "clusters-trace-4x4-a" },
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
