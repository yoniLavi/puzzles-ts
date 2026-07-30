/*
 * slide-trace.c: C-reference fixture generator for the Slide TS port
 * (openspec add-slide-ts-port).
 *
 * Includes unfinished/slide.c directly (its generator and solver are static)
 * and, for a curated set of (params, seed) tuples spanning every preset plus a
 * size sweep, generates a board with the upstream generator and emits the
 * description as JSON, plus the minimum solution length the upstream solver
 * reports for that board and the wall-clock the generation took.
 *
 * The TS port replays the same (params, seed) through its own generator and
 * asserts byte-for-byte equality of the desc. Slide's generator is
 * solver-gated at every step — it deletes singletons until the board becomes
 * soluble, then keeps each block merge only while it *stays* soluble — so that
 * one assertion validates the exhaustive BFS solver's verdict on every
 * intermediate board, the disjoint-set merge bookkeeping, the run-length codec
 * and the single `shuffle` draw, all at once (playbook §4.4). The recorded
 * `minMoves` is then re-derived by the TS solver independently.
 *
 * NOT in the matrix: any board with w*h <= 24. Upstream tests solubility
 * *before* each singleton removal and never after the last one, so a board that
 * only becomes soluble once the final singleton goes hits
 * `assert(!"We shouldn't get here")` — which is every 5x4 and 6x4 board. There
 * is no C answer to match there; the port's divergence (run the missing final
 * check) is covered by a behavioural test instead.
 *
 * `genMs` is carried, never asserted on (a wall-clock assertion measures the
 * box, not the code). It exists because Slide's generation cost has an
 * enormous tail — the same size can take 0.4s or 23s depending on the seed —
 * and the only way to tell a port regression from upstream's algorithm is to
 * have the C's own number on the same seed.
 *
 * Build (needs the real random.c, so the pure-C config):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make slide-trace)
 *   build/native/auxiliary/slide-trace \
 *     > src/native/games/slide/__fixtures__/slide-c-reference.json
 *
 * unfinished/slide.c is deleted when the port ships at owner-confirmed parity;
 * this harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "../unfinished/slide.c"

typedef struct {
    int w;
    int h;
    int maxmoves;
    const char *seed;
} trace_case;

static const trace_case CASES[] = {
    /* Every upstream preset. */
    { 7, 6, 25, "slide-trace-0" },
    { 7, 6, -1, "slide-trace-1" },
    { 8, 6, -1, "slide-trace-2" },

    /*
     * A size sweep. 5x5 is the smallest size that produces a non-trivial
     * puzzle; the oblong pairs exercise the edge list's horizontal/vertical
     * split, which a square board cannot distinguish; 6x8 is a tall board of
     * the same area as the largest preset.
     */
    { 5, 5, -1, "slide-trace-3" },
    { 6, 5, -1, "slide-trace-4" },
    { 5, 6, -1, "slide-trace-5" },
    { 7, 5, -1, "slide-trace-6" },
    { 6, 6, -1, "slide-trace-7" },
    { 8, 5, -1, "slide-trace-8" },
    { 6, 8, -1, "slide-trace-9" },

    /* Move-limited boards: upstream notes the limit makes generation slower,
     * and it takes a different path out of the singleton-removal scan. */
    { 6, 5, 10, "slide-trace-10" },
    { 7, 5, 20, "slide-trace-11" },
    { 7, 6, 40, "slide-trace-12" },
};

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
        game_state *st;
        struct timespec t0, t1;
        double gen_ms;
        int min_moves;

        params.w = c->w;
        params.h = c->h;
        params.maxmoves = c->maxmoves;

        rs = random_new(c->seed, (int)strlen(c->seed));
        clock_gettime(CLOCK_MONOTONIC, &t0);
        desc = new_game_desc(&params, rs, &aux, false);
        clock_gettime(CLOCK_MONOTONIC, &t1);
        gen_ms = (t1.tv_sec - t0.tv_sec) * 1000.0 +
                 (t1.tv_nsec - t0.tv_nsec) / 1000000.0;

        /* Re-derive the minimum solution length from the published board, so
         * the TS side has an independent number to agree with rather than only
         * the one baked into the desc. */
        st = new_game(NULL, &params, desc);
        min_moves = solve_board(st->w, st->h, st->board, st->imm->forcefield,
                                st->tx, st->ty, -1, NULL);
        free_game(st);

        fprintf(out,
                "    { \"w\": %d, \"h\": %d, \"maxmoves\": %d, \"seed\": \"%s\", "
                "\"desc\": \"%s\", \"minMoves\": %d, \"genMs\": %.1f }%s\n",
                c->w, c->h, c->maxmoves, c->seed, desc, min_moves, gen_ms,
                (i + 1 < n) ? "," : "");
        fflush(out);

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
