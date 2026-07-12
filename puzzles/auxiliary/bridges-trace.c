/*
 * bridges-trace.c: C-reference fixture generator for the Bridges TS port
 * (openspec add-bridges-ts-port).
 *
 * Includes bridges.c directly (its functions are static) and, for a curated
 * set of (params, seed) pairs, generates a board with the upstream generator
 * and emits the desc as JSON. The TS port replays the same (params, seed)
 * through its own generator and asserts byte-for-byte equality (the generator
 * is a faithful port over the bit-identical RNG; nothing sorts/shuffles the
 * island list before encoding, so the desc is deterministic per seed).
 *
 * The aux solution is not emitted: the TS generator does not produce one (the
 * Solve button re-derives the unique deductive solution), so there is nothing
 * to compare it against.
 *
 * Build (needs the real random.c, so the pure-C config):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make bridges-trace)
 *   build/native/auxiliary/bridges-trace \
 *     > src/native/games/bridges/__fixtures__/bridges-c-reference.json
 *
 * bridges.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../bridges.c"

typedef struct {
    int w, h, maxb, islands, expansion;
    bool allowloops;
    int difficulty;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* The nine upstream presets (7/10/15 square x Easy/Medium/Hard). */
    { 7,  7,  2, 30, 10, true, 0, "bridges-trace-0" },
    { 7,  7,  2, 30, 10, true, 1, "bridges-trace-1" },
    { 7,  7,  2, 30, 10, true, 2, "bridges-trace-2" },
    { 10, 10, 2, 30, 10, true, 0, "bridges-trace-3" },
    { 10, 10, 2, 30, 10, true, 1, "bridges-trace-4" },
    { 10, 10, 2, 30, 10, true, 2, "bridges-trace-5" },
    { 15, 15, 2, 30, 10, true, 0, "bridges-trace-6" },
    { 15, 15, 2, 30, 10, true, 1, "bridges-trace-7" },
    { 15, 15, 2, 30, 10, true, 2, "bridges-trace-8" },
    /* Loops disallowed exercises map_hasloops in the grading solver. */
    { 10, 10, 2, 30, 10, false, 2, "bridges-trace-9" },
    /* maxb 4 and a rectangular non-preset size, for coverage. */
    { 8,  8,  4, 30, 10, true, 1, "bridges-trace-10" },
    { 12, 8,  2, 25, 20, true, 2, "bridges-trace-11" },
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
        params.maxb = c->maxb;
        params.islands = c->islands;
        params.expansion = c->expansion;
        params.allowloops = c->allowloops;
        params.difficulty = c->difficulty;

        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        char *desc = new_game_desc(&params, rs, &aux, false);

        fprintf(out,
                "    { \"w\": %d, \"h\": %d, \"maxb\": %d, \"islands\": %d, "
                "\"expansion\": %d, \"allowloops\": %s, \"difficulty\": %d, "
                "\"seed\": \"%s\", \"desc\": ",
                c->w, c->h, c->maxb, c->islands, c->expansion,
                c->allowloops ? "true" : "false", c->difficulty, c->seed);
        put_json_string(out, desc);
        fprintf(out, " }%s\n", (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
