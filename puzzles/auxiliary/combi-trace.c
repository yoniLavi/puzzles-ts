/*
 * combi-trace.c: characterization-trace generator for combi.c.
 *
 * Part of the puzzles-ts port. Exercises the public combi.c API over
 * a curated grid of (r, n) pairs and emits a JSON corpus to stdout.
 * The TS port replays the corpus against its `src/native/combi/index.ts`
 * implementation and asserts the lex-ordered enumeration matches
 * element-for-element.
 *
 * Build via puzzles/auxiliary/CMakeLists.txt:
 *   cliprogram(combi-trace combi-trace.c)
 *
 * Usage:
 *   ./combi-trace > corpus.json
 *
 * Fixtures cover the degenerate cases (r==0, r==n), small hand-inspectable
 * cases, a case large enough to exercise the multi-step `i--` rewind in
 * next_combi, and one fixture that records a second pass after
 * reset_combi so the replay can verify rewind semantics.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "puzzles.h"

/* combi has no string outputs, so no JSON-string escaper is needed —
 * fixture names are ASCII identifiers we control. */

/* Emit one full combi enumeration as a JSON array of r-tuples. */
static void emit_enumeration(FILE *out, combi_ctx *c)
{
    int i, first = 1;
    fputc('[', out);
    while (next_combi(c)) {
        if (!first) fputs(", ", out);
        first = 0;
        fputc('[', out);
        for (i = 0; i < c->r; i++) {
            if (i) fputs(", ", out);
            fprintf(out, "%d", c->a[i]);
        }
        fputc(']', out);
    }
    fputc(']', out);
}

typedef struct {
    const char *name;
    int r, n;
    int reset;  /* if non-zero, record a second enumeration after reset_combi */
} fixture;

static const fixture FIXTURES[] = {
    {"degenerate_r_zero",      0, 1, 0},
    {"degenerate_r_one_n_one", 1, 1, 0},
    {"small_2_of_5",           2, 5, 0},
    {"hand_inspect_3_of_5",    3, 5, 0},
    {"degenerate_r_equals_n",  5, 5, 0},
    {"rewind_2_of_10",         2, 10, 0},
    {"midsized_4_of_8",        4, 8, 0},
    {"reset_3_of_5",           3, 5, 1},
};

int main(int argc, char **argv)
{
    (void)argc; (void)argv;
    FILE *out = stdout;
    size_t i;
    int n = (int)(sizeof FIXTURES / sizeof *FIXTURES);

    fputs("{\n  \"version\": 1,\n  \"fixtures\": [\n", out);
    for (i = 0; i < (size_t)n; i++) {
        const fixture *f = &FIXTURES[i];
        combi_ctx *c = new_combi(f->r, f->n);
        fprintf(out, "    {\n      \"name\": \"%s\",\n      \"r\": %d,\n      \"n\": %d,\n",
                f->name, f->r, f->n);
        if (f->reset) fputs("      \"reset\": true,\n", out);
        fputs("      \"enumeration\": ", out);
        emit_enumeration(out, c);
        if (f->reset) {
            reset_combi(c);
            fputs(",\n      \"enumeration_after_reset\": ", out);
            emit_enumeration(out, c);
        }
        fputs("\n    }", out);
        if (i + 1 < (size_t)n) fputc(',', out);
        fputc('\n', out);
        free_combi(c);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
