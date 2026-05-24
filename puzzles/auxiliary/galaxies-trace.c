/*
 * galaxies-trace.c — transient C-reference generator for the
 * dev-time differential spot-check (add-galaxies-ts-port).
 *
 * Part of the puzzles-ts port. Generates a small JSON fixture of
 * Galaxies boards produced by the C engine for a fixed set of
 * (w, h, diff, seed) tuples, including each board's solver-verified
 * difficulty. The TS port's gated differential test
 * (galaxies-differential.test.ts) decodes each board and runs its
 * own solver against it, asserting a unique solution at exactly the
 * C-recorded difficulty.
 *
 * Build via puzzles/auxiliary/CMakeLists.txt:
 *   cliprogram(galaxies-trace galaxies-trace.c)
 *
 * Usage:
 *   ./galaxies-trace > galaxies-c-reference.json
 *
 * Transient: this file is removed in the same change that deletes
 * `puzzles/galaxies.c` (per the proposal). The gated
 * frozen-snapshot test takes over its role from then on.
 *
 * We `#include "galaxies.c"` directly to reach the static
 * generator/solver helpers; this is the same technique combi-trace
 * would use if combi.c's helpers were static.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "puzzles.h"

/* Pull in the entire galaxies.c, exposing every static function.
 * We don't define COMBINED or EDITOR — galaxies.c declares its own
 * `const game thegame` symbol which we discard by linking against
 * `nullfe.c` (the cliprogram() rule wires that in automatically). */
#include "../galaxies.c"

typedef struct {
    int w, h;
    int diff;
    const char *seed;
} fixture;

static const fixture fixtures[] = {
    /* Two boards per preset, fixed seeds for reproducibility. */
    { 7,  7, DIFF_NORMAL,       "galaxies-trace-7-n-0" },
    { 7,  7, DIFF_NORMAL,       "galaxies-trace-7-n-1" },
    { 7,  7, DIFF_UNREASONABLE, "galaxies-trace-7-u-0" },
    { 7,  7, DIFF_UNREASONABLE, "galaxies-trace-7-u-1" },
    { 10, 10, DIFF_NORMAL,      "galaxies-trace-10-n-0" },
    { 10, 10, DIFF_NORMAL,      "galaxies-trace-10-n-1" },
    { 10, 10, DIFF_UNREASONABLE,"galaxies-trace-10-u-0" },
    { 10, 10, DIFF_UNREASONABLE,"galaxies-trace-10-u-1" },
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
        game_state *state;
        int solver_diff;

        rs = random_new(f->seed, strlen(f->seed));
        params.w = f->w;
        params.h = f->h;
        params.diff = f->diff;

        desc = new_game_desc(&params, rs, &aux, false);
        state = load_game(&params, desc, NULL);

        {
            game_state *copy = dup_game(state);
            clear_game(copy, false);
            solver_diff = solver_state(copy, DIFF_UNREASONABLE);
            free_game(copy);
        }

        if (i > 0) fputc(',', stdout);
        fputs("\n    {\n", stdout);
        fprintf(stdout, "      \"w\": %d,\n", f->w);
        fprintf(stdout, "      \"h\": %d,\n", f->h);
        fprintf(stdout, "      \"diff\": \"%c\",\n",
                galaxies_diffchars[f->diff]);
        fputs("      \"seed\": ", stdout);
        emit_json_string(stdout, f->seed);
        fputs(",\n      \"desc\": ", stdout);
        emit_json_string(stdout, desc);
        fprintf(stdout, ",\n      \"solverDiff\": \"%c\"\n    }",
                galaxies_diffchars[solver_diff]);

        free_game(state);
        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("\n  ]\n}\n", stdout);
    return 0;
}
