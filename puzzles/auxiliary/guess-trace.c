/*
 * guess-trace.c: characterization-trace generator for guess.c, used to
 * freeze a tiny C-reference fixture for the TS port's differential test.
 *
 * It calls the real `guess` game's `new_desc` for fixed (seed, params)
 * pairs and emits the resulting game descriptions as JSON. The TS port
 * regenerates the same descriptions from `random.ts` + its obfuscation
 * codec and asserts byte-for-byte equality — the cleanest possible
 * differential for Guess (the secret is just an obfuscated random
 * sequence, so an identical desc proves the whole generator path).
 *
 * Transient: built only to refresh the fixture, then removed together
 * with guess.c when the port ships. Build:
 *   cliprogram(guess-trace guess-trace.c ${CMAKE_CURRENT_SOURCE_DIR}/../guess.c)
 *   ./scripts/build-native.sh guess-trace
 *   ./build/native/auxiliary/guess-trace > \
 *     src/native/games/guess/__fixtures__/guess-c-reference.json
 */

#include <stdio.h>
#include <string.h>

#include "puzzles.h"

extern const struct game thegame;

static int first = 1;

static void trace_desc(const char *seed, const char *paramstr)
{
    random_state *rs = random_new(seed, strlen(seed));
    game_params *par = thegame.default_params();
    thegame.decode_params(par, paramstr);

    char *aux = NULL;
    char *desc = thegame.new_desc(par, rs, &aux, false);

    printf("%s\n    {\"seed\": \"%s\", \"params\": \"%s\", \"desc\": \"%s\"}",
           first ? "" : ",", seed, paramstr, desc);
    first = 0;

    sfree(desc);
    if (aux)
        sfree(aux);
    thegame.free_params(par);
    random_free(rs);
}

int main(void)
{
    static const char *const seeds[] = {
        "0", "1", "42", "guess", "abcdef0123", "999",
    };
    /* A spread of rulesets: default, Super, no-duplicates, blanks. */
    static const char *const params[] = {
        "c6p4g10BM", "c8p5g12BM", "c6p4g10Bm", "c8p4g10bM", "c10p4g10BM",
    };

    printf("[");
    for (size_t pi = 0; pi < sizeof(params) / sizeof(*params); pi++)
        for (size_t si = 0; si < sizeof(seeds) / sizeof(*seeds); si++)
            trace_desc(seeds[si], params[pi]);
    printf("\n]\n");
    return 0;
}
