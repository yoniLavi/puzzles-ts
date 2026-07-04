/*
 * slant-trace.c: C-reference fixture generator for the Slant TS port
 * (openspec add-slant-ts-port).
 *
 * Includes slant.c directly (its functions are static) and, for a
 * curated set of (params, seed) pairs, generates a board with the
 * upstream generator and emits the desc + aux solution as JSON. The TS
 * port replays the same (params, seed) through its own generator and
 * asserts byte-for-byte equality (the generator is a faithful port over
 * the bit-identical RNG).
 *
 * Build (needs the real random.c, so the pure-C config):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make slant-trace)
 *   build/native/auxiliary/slant-trace \
 *     > src/native/games/slant/__fixtures__/slant-c-reference.json
 *
 * slant.c is deleted when the port ships at owner-confirmed parity;
 * this harness goes with it (the fixture stays committed as the gated
 * check's baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../slant.c"

typedef struct {
    int w, h;
    int diff;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* The six upstream presets. */
    { 5, 5, DIFF_EASY, "slant-trace-0" },
    { 5, 5, DIFF_HARD, "slant-trace-1" },
    { 8, 8, DIFF_EASY, "slant-trace-2" },
    { 8, 8, DIFF_HARD, "slant-trace-3" },
    { 12, 10, DIFF_EASY, "slant-trace-4" },
    { 12, 10, DIFF_HARD, "slant-trace-5" },
    /* Non-preset sizes: minimum, rectangular both ways, larger. */
    { 2, 2, DIFF_EASY, "slant-trace-6" },
    { 7, 12, DIFF_HARD, "slant-trace-7" },
    { 10, 6, DIFF_HARD, "slant-trace-8" },
    { 16, 12, DIFF_EASY, "slant-trace-9" },
};

/* Print a string as a JSON value, escaping backslashes (the aux solution
 * is a string of '\' and '/'). */
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
        params.diff = c->diff;

        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        char *desc = new_game_desc(&params, rs, &aux, false);

        fprintf(out, "    { \"w\": %d, \"h\": %d, \"diff\": %d, \"seed\": \"%s\", \"desc\": ",
                c->w, c->h, c->diff, c->seed);
        put_json_string(out, desc);
        fputs(", \"aux\": ", out);
        put_json_string(out, aux ? aux : "");
        fprintf(out, " }%s\n", (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
