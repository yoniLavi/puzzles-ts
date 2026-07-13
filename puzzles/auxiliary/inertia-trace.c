/*
 * inertia-trace.c: C-reference fixture generator for the Inertia TS port
 * (openspec add-inertia-ts-port).
 *
 * Includes inertia.c directly (its functions are static) and, for a curated set
 * of (params, seed) pairs, generates a board with the upstream generator and
 * emits the desc as JSON, together with the route the upstream solver finds
 * from the starting position.
 *
 * Both are byte-comparable against the TS port:
 *
 *  - the desc, because the generator's only RNG draws are two `shuffle` calls
 *    and `random.ts` is bit-identical to `random.c`;
 *  - the route, because `solve_game` is deterministic given the board (its one
 *    `qsort` sorts `target*n + source` keys that are distinct by construction,
 *    so tie order never arises), and the TS port reproduces its graph-node,
 *    edge and BFS orderings.
 *
 * Build (needs the real random.c, so the pure-C config):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make inertia-trace)
 *   build/native/auxiliary/inertia-trace \
 *     > src/native/games/inertia/__fixtures__/inertia-c-reference.json
 *
 * inertia.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../inertia.c"

typedef struct {
    int w, h;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* The three upstream presets, twice each. */
    { 10, 8,  "inertia-trace-0" },
    { 10, 8,  "inertia-trace-1" },
    { 15, 12, "inertia-trace-2" },
    { 15, 12, "inertia-trace-3" },
    { 20, 16, "inertia-trace-4" },
    { 20, 16, "inertia-trace-5" },
    /* A square grid, and the smallest legal ones — these exercise the
     * "not enough gem candidates" and maxdist-threshold rejection paths
     * hardest, since a tiny grid is easy to fill with dead space. */
    { 12, 12, "inertia-trace-6" },
    { 3,  2,  "inertia-trace-7" },
    { 4,  4,  "inertia-trace-8" },
    { 6,  4,  "inertia-trace-9" },
};

static void put_json_string(FILE *out, const char *s)
{
    fputc('"', out);
    for (; *s; s++) {
        if (*s == '\\' || *s == '"')
            fputc('\\', out);
        fputc(*s, out);
    }
    fputc('"', out);
}

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

        /* The route the upstream solver finds from the starting position.
         * solve_game returns "S" followed by one digit per move. */
        game_state *state = new_game(NULL, &params, desc);
        const char *error = NULL;
        char *soln = solve_game(state, state, NULL, &error);

        fprintf(out, "    { \"w\": %d, \"h\": %d, \"seed\": \"%s\", \"desc\": ",
                c->w, c->h, c->seed);
        put_json_string(out, desc);
        fputs(", \"route\": ", out);
        if (soln)
            put_json_string(out, soln + 1);   /* skip the leading 'S' */
        else
            fputs("null", out);
        fprintf(out, " }%s\n", (i + 1 < n) ? "," : "");

        if (soln) sfree(soln);
        free_game(state);
        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
