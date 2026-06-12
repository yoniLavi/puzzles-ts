/*
 * samegame-trace.c — transient C-reference generator for the dev-time
 * differential spot-check (add-samegame-ts-port).
 *
 * Part of the puzzles-ts port. Emits a small JSON fixture of Same Game
 * boards produced by the C engine for a fixed set of
 * (w, h, ncols, scoresub, soluble, seed) tuples. Same Game's generator
 * consults no solver, so the desc *is* the whole reproducible output:
 * the TS port's gated differential test (samegame-differential.test.ts)
 * asserts its own `newDesc` reproduces each desc byte-for-byte, proving
 * `random.ts` is bit-identical end-to-end through both the
 * guaranteed-soluble and the legacy-random generators.
 *
 * Build via puzzles/auxiliary/CMakeLists.txt:
 *   cliprogram(samegame-trace samegame-trace.c)
 *
 * Usage:
 *   ./samegame-trace > samegame-c-reference.json
 *
 * Transient: this file is removed in the same change that deletes
 * `puzzles/samegame.c` (per-game C-deletion doctrine). The gated
 * frozen-snapshot test takes over its role from then on.
 *
 * We `#include "../samegame.c"` directly to reach the static
 * `new_game_desc`; the `const game thegame` symbol it defines is
 * harmless (nullfe.c, wired in by cliprogram(), defines no `thegame`).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "puzzles.h"

#include "../samegame.c"

typedef struct {
    int w, h, ncols, scoresub;
    bool soluble;
    const char *seed;
} fixture;

static const fixture fixtures[] = {
    /* Guaranteed-soluble generator across the small presets, two seeds each. */
    { 5,  5, 3, 2, true,  "samegame-trace-5-a" },
    { 5,  5, 3, 2, true,  "samegame-trace-5-b" },
    { 10, 5, 3, 2, true,  "samegame-trace-10-a" },
    { 10, 5, 3, 2, true,  "samegame-trace-10-b" },
    { 8,  8, 4, 2, true,  "samegame-trace-8c4-a" },
    { 5,  5, 3, 1, true,  "samegame-trace-5s1-a" },
    /* Legacy not-guaranteed-soluble generator (the `r` variant). */
    { 6,  6, 3, 2, false, "samegame-trace-rand6-a" },
    { 8,  8, 4, 2, false, "samegame-trace-rand8-a" },
};

static void emit_json_string(FILE *out, const char *s)
{
    fputc('"', out);
    for (; *s; s++) {
        unsigned char c = (unsigned char)*s;
        switch (c) {
          case '"':  fputs("\\\"", out); break;
          case '\\': fputs("\\\\", out); break;
          default:
            if (c < 0x20) fprintf(out, "\\u%04x", c);
            else fputc(c, out);
        }
    }
    fputc('"', out);
}

int main(void)
{
    size_t i;
    fputs("{\n  \"fixtures\": [", stdout);
    for (i = 0; i < sizeof(fixtures)/sizeof(fixtures[0]); i++) {
        const fixture *f = &fixtures[i];
        game_params params;
        random_state *rs;
        char *aux = NULL;
        char *desc;

        rs = random_new(f->seed, strlen(f->seed));
        params.w = f->w;
        params.h = f->h;
        params.ncols = f->ncols;
        params.scoresub = f->scoresub;
        params.soluble = f->soluble;

        desc = new_game_desc(&params, rs, &aux, false);

        if (i > 0) fputc(',', stdout);
        fputs("\n    {\n", stdout);
        fprintf(stdout, "      \"w\": %d,\n", f->w);
        fprintf(stdout, "      \"h\": %d,\n", f->h);
        fprintf(stdout, "      \"ncols\": %d,\n", f->ncols);
        fprintf(stdout, "      \"scoresub\": %d,\n", f->scoresub);
        fprintf(stdout, "      \"soluble\": %s,\n", f->soluble ? "true" : "false");
        fputs("      \"seed\": ", stdout);
        emit_json_string(stdout, f->seed);
        fputs(",\n      \"desc\": ", stdout);
        emit_json_string(stdout, desc);
        fputs("\n    }", stdout);

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("\n  ]\n}\n", stdout);
    return 0;
}
