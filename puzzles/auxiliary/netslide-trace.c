/*
 * netslide-trace.c: C-reference fixture generator for the Netslide TS port
 * (openspec add-netslide-ts-port).
 *
 * Includes netslide.c directly (its generator is static) and, for a curated set
 * of (params, seed) pairs, generates a board with the upstream generator and
 * emits the desc — plus the `aux` unshuffled solution grid, which is what the
 * port's `solve()` replays — as JSON.
 *
 * Both are byte-comparable against the TS port, because the generator is
 * deterministic given the seed all the way to the desc: its only RNG draws are
 * `random_upto` calls, `random.ts` is bit-identical to `random.c`, and the one
 * ordered structure it indexes into (the `tree234` of candidate extensions,
 * ordered by `xyd_cmp`) is reproduced exactly by the port's `SortedMultiset`.
 * There is no `qsort` anywhere near the desc.
 *
 * Build (needs the real random.c, so the pure-C config):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make netslide-trace)
 *   build/native/auxiliary/netslide-trace \
 *     > src/native/games/netslide/__fixtures__/netslide-c-reference.json
 *
 * netslide.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../netslide.c"

typedef struct {
    int w, h;
    int wrapping;
    float barrier_probability;
    int movetarget;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* The nine upstream presets: 3x3 / 4x4 / 5x5 x easy / medium / hard. */
    { 3, 3, 0, 1.0F, 0, "netslide-trace-0" },
    { 3, 3, 0, 0.0F, 0, "netslide-trace-1" },
    { 3, 3, 1, 0.0F, 0, "netslide-trace-2" },
    { 4, 4, 0, 1.0F, 0, "netslide-trace-3" },
    { 4, 4, 0, 0.0F, 0, "netslide-trace-4" },
    { 4, 4, 1, 0.0F, 0, "netslide-trace-5" },
    { 5, 5, 0, 1.0F, 0, "netslide-trace-6" },
    { 5, 5, 0, 0.0F, 0, "netslide-trace-7" },
    { 5, 5, 1, 0.0F, 0, "netslide-trace-8" },

    /* Non-preset shapes. A *fractional* barrier probability is the case that
     * pins the single-precision `(int)(float * count)` barrier count; a
     * non-square grid pins that the w/h axes aren't transposed anywhere; an
     * explicit movetarget pins the shuffle's accept/reject loop (a rejected
     * slide still consumed its RNG draws); and wrapping with barriers is the
     * only combination in which the desc can carry a `v`/`h` marker on the
     * grid's outer edge. */
    { 5, 5, 0, 0.5F,  0, "netslide-trace-9" },
    { 6, 4, 0, 0.3F,  0, "netslide-trace-10" },
    { 4, 6, 0, 1.0F, 25, "netslide-trace-11" },
    { 5, 5, 1, 0.75F, 0, "netslide-trace-12" },
    { 2, 2, 0, 1.0F,  0, "netslide-trace-13" },
    { 7, 7, 1, 0.2F, 60, "netslide-trace-14" },
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
        params.width = c->w;
        params.height = c->h;
        params.wrapping = c->wrapping;
        params.barrier_probability = c->barrier_probability;
        params.movetarget = c->movetarget;

        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        char *desc = new_game_desc(&params, rs, &aux, false);

        fprintf(out,
                "    { \"w\": %d, \"h\": %d, \"wrapping\": %s, "
                "\"barrierProbability\": %g, \"movetarget\": %d, \"seed\": \"%s\", "
                "\"desc\": ",
                c->w, c->h, c->wrapping ? "true" : "false",
                c->barrier_probability, c->movetarget, c->seed);
        put_json_string(out, desc);

        /* aux is a solve move: 'S' followed by one hex digit per tile. Record
         * just the grid, which is what the TS `solve()` replays. */
        fputs(", \"aux\": ", out);
        if (aux)
            put_json_string(out, aux + 1);   /* skip the leading 'S' */
        else
            fputs("null", out);
        fprintf(out, " }%s\n", (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
