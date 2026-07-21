/*
 * subsets-trace.c: C-reference fixture generator for the Subsets TS port
 * (openspec add-subsets-ts-port).
 *
 * Includes unreleased/subsets.c directly (its functions are static) and,
 * for a curated set of seeds at the single supported params (4x4n4),
 * generates a board with the upstream generator and emits the desc as
 * JSON. The TS port replays the same seeds through its own generator and
 * asserts byte-for-byte equality of the desc — the generator is a faithful
 * port over the bit-identical RNG and gates every cell-blanking step on the
 * deductive solver, so one byte-match validates the generator, the
 * solver's exact strength and the codec together.
 *
 * Build (needs the real random.c, so the pure-C config):
 *   ./scripts/build-native.sh subsets-trace
 *   build/native/auxiliary/subsets-trace \
 *     > src/native/games/subsets/__fixtures__/subsets-c-reference.json
 *
 * subsets.c is deleted when the port ships at owner-confirmed parity; this
 * harness goes with it (the fixture stays committed as the gated check's
 * baseline).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../unreleased/subsets.c"

static const char *SEEDS[] = {
    "subsets-trace-a", "subsets-trace-b", "subsets-trace-c",
    "subsets-trace-d", "subsets-trace-e", "subsets-trace-f",
    "subsets-trace-g", "subsets-trace-h", "subsets-trace-i",
    "subsets-trace-j", "subsets-trace-k", "subsets-trace-l",
};

int main(void)
{
    FILE *out = stdout;
    int n = (int)(sizeof SEEDS / sizeof *SEEDS);

    fputs("{\n  \"version\": 1,\n  \"fixtures\": [\n", out);
    for (int i = 0; i < n; i++) {
        game_params params;
        params.w = params.h = params.n = 4;

        random_state *rs = random_new(SEEDS[i], (int)strlen(SEEDS[i]));
        char *aux = NULL;
        char *desc = new_game_desc(&params, rs, &aux, false);

        fprintf(out,
                "    { \"w\": 4, \"h\": 4, \"n\": 4, "
                "\"seed\": \"%s\", \"desc\": \"%s\" }%s\n",
                SEEDS[i], desc, (i + 1 < n) ? "," : "");

        sfree(desc);
        if (aux) sfree(aux);
        random_free(rs);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
