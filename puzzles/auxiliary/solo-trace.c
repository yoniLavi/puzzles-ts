/*
 * solo-trace.c: C-reference fixture generator for the Solo TS port
 * (openspec add-solo-ts-port).
 *
 * Includes solo.c directly (its generator/solver are static) and, for a curated
 * set of (params, seed) pairs across all four variants (standard / jigsaw / X /
 * killer) and several difficulties, generates a board with the upstream
 * generator and emits the desc plus the difficulty the upstream solver reaches
 * on the *published* board (diff + kdiff). The TS port replays the same
 * (params, seed) through its own generator and asserts byte-for-byte equality of
 * the desc (a faithful port over the bit-identical RNG — no qsort/order-
 * dependent step exists in any variant, see design D5), plus that its solver
 * grades the published board at the identical (diff, kdiff).
 *
 * Build (needs the real random.c, so the pure-C config — playbook §4.2):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make solo-trace)
 *   build/native/auxiliary/solo-trace \
 *     > src/native/games/solo/__fixtures__/solo-c-reference.json
 *
 * solo.c + divvy.c are deleted when the port ships at owner-confirmed parity;
 * this harness goes with them (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "../solo.c"

typedef struct {
    int c, r, symm, diff, kdiff;
    bool xtype, killer;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    { 2, 2, SYMM_ROT2, DIFF_BLOCK,     DIFF_KMINMAX,   false, false, "solo-trace-0" },
    { 2, 3, SYMM_ROT2, DIFF_SIMPLE,    DIFF_KMINMAX,   false, false, "solo-trace-1" },
    { 3, 3, SYMM_ROT2, DIFF_SIMPLE,    DIFF_KMINMAX,   false, false, "solo-trace-2" },
    { 3, 3, SYMM_ROT2, DIFF_INTERSECT, DIFF_KMINMAX,   false, false, "solo-trace-3" },
    { 3, 3, SYMM_ROT2, DIFF_SET,       DIFF_KMINMAX,   false, false, "solo-trace-4" },
    { 3, 3, SYMM_ROT2, DIFF_EXTREME,   DIFF_KMINMAX,   false, false, "solo-trace-5" },
    { 3, 3, SYMM_ROT2, DIFF_RECURSIVE, DIFF_KMINMAX,   false, false, "solo-trace-6" },
    { 3, 3, SYMM_ROT2, DIFF_SIMPLE,    DIFF_KMINMAX,   true,  false, "solo-trace-7" },
    { 3, 3, SYMM_ROT2, DIFF_SET,       DIFF_KMINMAX,   true,  false, "solo-trace-8" },
    { 9, 1, SYMM_ROT2, DIFF_SIMPLE,    DIFF_KMINMAX,   false, false, "solo-trace-9" },
    { 9, 1, SYMM_ROT2, DIFF_SET,       DIFF_KMINMAX,   false, false, "solo-trace-10" },
    { 9, 1, SYMM_ROT2, DIFF_SIMPLE,    DIFF_KMINMAX,   true,  false, "solo-trace-11" },
    { 3, 3, SYMM_NONE, DIFF_BLOCK,     DIFF_KINTERSECT, false, true, "solo-trace-12" },
    { 3, 4, SYMM_ROT2, DIFF_SIMPLE,    DIFF_KMINMAX,   false, false, "solo-trace-14" },
};

/* Difficulty (diff,kdiff) the upstream solver reaches on the published board. */
static void grade(const game_params *params, const char *desc,
                  int *diff_out, int *kdiff_out)
{
    const char *err = NULL;
    game_state *st = new_game(NULL, params, desc);
    int cr = st->cr;
    digit *grid = snewn(cr * cr, digit);
    struct difficulty dlev;
    (void)err;

    memcpy(grid, st->grid, cr * cr);
    dlev.maxdiff = DIFF_RECURSIVE;
    dlev.maxkdiff = DIFF_KINTERSECT;
    solver(cr, st->blocks, st->kblocks, st->xtype, grid, st->kgrid, &dlev);

    *diff_out = dlev.diff;
    *kdiff_out = dlev.kdiff;

    sfree(grid);
    free_game(st);
}

int main(void)
{
    FILE *out = stdout;
    int n = (int)(sizeof CASES / sizeof *CASES);

    precompute_sum_bits();

    fputs("{\n  \"version\": 1,\n  \"fixtures\": [\n", out);
    for (int i = 0; i < n; i++) {
        const trace_case *c = &CASES[i];
        game_params params;
        params.c = c->c;
        params.r = c->r;
        params.symm = c->symm;
        params.diff = c->diff;
        params.kdiff = c->kdiff;
        params.xtype = c->xtype;
        params.killer = c->killer;

        /* Per-case progress to stderr (fixture regen can take a minute). */
        clock_t t0 = clock();
        random_state *rs = random_new(c->seed, (int)strlen(c->seed));
        char *aux = NULL;
        char *desc = new_game_desc(&params, rs, &aux, false);
        fprintf(stderr, "case %d (%dx%d diff=%d kdiff=%d x=%d k=%d): %.2fs\n",
                i, c->c, c->r, c->diff, c->kdiff, c->xtype, c->killer,
                (double)(clock() - t0) / CLOCKS_PER_SEC);

        int diff = 0, kdiff = 0;
        grade(&params, desc, &diff, &kdiff);

        fprintf(out,
                "    { \"c\": %d, \"r\": %d, \"symm\": %d, \"diff\": %d, "
                "\"kdiff\": %d, \"xtype\": %s, \"killer\": %s, "
                "\"seed\": \"%s\", \"desc\": \"%s\", "
                "\"solverDiff\": %d, \"solverKdiff\": %d }%s\n",
                c->c, c->r, c->symm, c->diff, c->kdiff,
                c->xtype ? "true" : "false", c->killer ? "true" : "false",
                c->seed, desc, diff, kdiff, (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
