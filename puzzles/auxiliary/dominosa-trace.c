/*
 * dominosa-trace.c: characterization-trace generator for dominosa.c.
 *
 * Part of the puzzles-ts port. For a curated grid of (n, difficulty, seed)
 * fixtures it drives the upstream generator (`new_game_desc`) over the
 * bit-identical RNG and emits a JSON corpus of the resulting descs to stdout.
 * The TS port (`src/native/games/dominosa/`) replays each fixture and asserts
 * `newDominosaDesc({n,diff}, randomNew(seed)).desc` matches byte-for-byte.
 *
 * Because the generator is solver-gated (it keeps a board only if the solver
 * grades it at exactly the target difficulty), a byte-match on the desc
 * transitively proves the TS solver reached the identical verdict to C on
 * every intermediate board (playbook §4.4) — the strongest bar.
 *
 * Reaches dominosa.c's *static* generator by #including the source directly
 * (no STANDALONE_SOLVER, so no main of its own).
 *
 * Build via puzzles/auxiliary/CMakeLists.txt:
 *   cliprogram(dominosa-trace dominosa-trace.c)
 * Build pure-C (the umbrella defaults TS-random ON, which drops random.c):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make dominosa-trace)
 *   build/native/auxiliary/dominosa-trace > \
 *     src/native/games/dominosa/__fixtures__/dominosa-c-reference.json
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "puzzles.h"
#include "../dominosa.c"

typedef struct {
    const char *name;
    int n;
    int diff;         /* DIFF_TRIVIAL..DIFF_AMBIGUOUS */
    const char *seed;
} fixture;

static const fixture FIXTURES[] = {
    {"trivial_n3",   3, DIFF_TRIVIAL,   "dominosa-t3"},
    {"trivial_n4",   4, DIFF_TRIVIAL,   "dominosa-t4"},
    {"trivial_n6",   6, DIFF_TRIVIAL,   "dominosa-t6"},
    {"basic_n4",     4, DIFF_BASIC,     "dominosa-b4"},
    {"basic_n6",     6, DIFF_BASIC,     "dominosa-b6"},
    {"basic_n7",     7, DIFF_BASIC,     "dominosa-b7"},
    {"hard_n6",      6, DIFF_HARD,      "dominosa-h6"},
    {"hard_n5",      5, DIFF_HARD,      "dominosa-h5"},
    {"extreme_n6",   6, DIFF_EXTREME,   "dominosa-e6"},
    {"ambiguous_n6", 6, DIFF_AMBIGUOUS, "dominosa-a6"},
};

int main(int argc, char **argv)
{
    (void)argc; (void)argv;
    FILE *out = stdout;
    int n = (int)(sizeof FIXTURES / sizeof *FIXTURES);
    int i;

    fputs("{\n  \"version\": 1,\n  \"fixtures\": [\n", out);
    for (i = 0; i < n; i++) {
        const fixture *f = &FIXTURES[i];
        game_params par;
        random_state *rs;
        char *aux = NULL;
        char *desc;

        par.n = f->n;
        par.diff = f->diff;
        rs = random_new(f->seed, strlen(f->seed));
        desc = new_game_desc(&par, rs, &aux, false);

        fprintf(out,
                "    {\n"
                "      \"name\": \"%s\",\n"
                "      \"n\": %d,\n"
                "      \"diff\": %d,\n"
                "      \"seed\": \"%s\",\n"
                "      \"desc\": \"%s\"\n"
                "    }%s\n",
                f->name, f->n, f->diff, f->seed, desc,
                (i + 1 < n) ? "," : "");

        sfree(desc);
        sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
