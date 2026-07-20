/*
 * Dump the Spectre tiling's lookup tables as JSON, for the TypeScript port.
 *
 * This is a *compile-and-print* extractor, not a textual scrape of the header
 * files, and that choice is deliberate. The table bodies in
 * spectre-tables-auto.h are plain literals, but their *names* are X-macro
 * expansions of HEX_LETTERS(Z), the entries reference HEX_* enum values, and
 * the probabilities are PROB_* macros. Anything that reads the headers as text
 * has to reimplement the preprocessor; compiling against them cannot drift.
 *
 * It also recovers the one thing the headers never store: the *lengths* of the
 * hexmap_* / hexin_* / specmap_* / specin_* arrays. Only `nposs` is kept at
 * runtime, so lenof() has to be applied at the point where the array's static
 * type is still visible -- i.e. right here, through the same X-macro, rather
 * than by hand-listing 9x6 array names.
 *
 * Build:  cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0 &&
 *         cmake --build build/native --target spectre-tables-dump
 * Run:    build/native/auxiliary/spectre-tables-dump > tables.json
 *
 * The consumer is scripts/gen-spectre-tables.mjs, which turns this JSON into
 * src/native/engine/tilings/spectre-tables.ts.
 */

#include <stdio.h>

#include "puzzles.h"

#include "spectre-internal.h"
#include "spectre-tables-manual.h"
#include "spectre-tables-auto.h"

/*
 * The ordinal order of HEX_LETTERS -- G D J L X P S F Y -- indexes hexdata[]
 * and every subhexes_* entry, so it is load-bearing and reproduced verbatim in
 * the emitted JSON's array order.
 */
struct HexTables {
    const char *letter;

    const struct MapEntry *hexmap;  size_t nhexmap;
    const struct MapEdge  *hexedges; size_t nhexedges;
    const struct MapEntry *hexin;   size_t nhexin;
    const struct MapEntry *specmap; size_t nspecmap;
    const struct MapEdge  *specedges; size_t nspecedges;
    const struct MapEntry *specin;  size_t nspecin;

    const Hex *subhexes; size_t nsubhexes;
    const struct Possibility *poss; size_t nposs;
};

static const struct HexTables hextables[] = {
    #define HEXTABLES_ENTRY(x) {                                        \
        #x,                                                             \
        hexmap_##x, lenof(hexmap_##x),                                  \
        hexedges_##x, lenof(hexedges_##x),                              \
        hexin_##x, lenof(hexin_##x),                                    \
        specmap_##x, lenof(specmap_##x),                                \
        specedges_##x, lenof(specedges_##x),                            \
        specin_##x, lenof(specin_##x),                                  \
        subhexes_##x, lenof(subhexes_##x),                              \
        poss_##x, lenof(poss_##x),                                      \
    },
    HEX_LETTERS(HEXTABLES_ENTRY)
    #undef HEXTABLES_ENTRY
};

static void print_map_entries(const char *name, const struct MapEntry *m,
                              size_t n)
{
    size_t i;
    printf("      \"%s\": [", name);
    for (i = 0; i < n; i++)
        printf("%s[%s,%u,%u]", i ? "," : "",
               m[i].internal ? "true" : "false",
               (unsigned)m[i].hi, (unsigned)m[i].lo);
    printf("],\n");
}

static void print_map_edges(const char *name, const struct MapEdge *e, size_t n)
{
    size_t i;
    printf("      \"%s\": [", name);
    for (i = 0; i < n; i++)
        printf("%s[%u,%u]", i ? "," : "",
               (unsigned)e[i].startindex, (unsigned)e[i].len);
    printf("],\n");
}

static void print_possibilities(const char *name,
                                const struct Possibility *p, size_t n)
{
    size_t i;
    printf("      \"%s\": [", name);
    for (i = 0; i < n; i++)
        printf("%s[%u,%u,%lu]", i ? "," : "",
               (unsigned)p[i].hi, (unsigned)p[i].lo, p[i].prob);
    printf("]\n");
}

int main(void)
{
    size_t i, j;

    printf("{\n");

    printf("  \"letters\": \"");
    for (i = 0; i < lenof(hextables); i++)
        printf("%s", hextables[i].letter);
    printf("\",\n");

    printf("  \"spectreAngles\": [");
    for (i = 0; i < lenof(spectre_angles); i++)
        printf("%s%d", i ? "," : "", spectre_angles[i]);
    printf("],\n");

    printf("  \"possSpectre\": [");
    for (i = 0; i < lenof(poss_spectre); i++)
        printf("%s[%u,%u,%lu]", i ? "," : "",
               (unsigned)poss_spectre[i].hi, (unsigned)poss_spectre[i].lo,
               poss_spectre[i].prob);
    printf("],\n");

    printf("  \"hexes\": [\n");
    for (i = 0; i < lenof(hextables); i++) {
        const struct HexTables *h = &hextables[i];

        printf("    {\n");
        printf("      \"letter\": \"%s\",\n", h->letter);
        printf("      \"numSubhexes\": %u,\n",
               num_subhexes((Hex)i));
        printf("      \"numSpectres\": %u,\n",
               num_spectres((Hex)i));

        printf("      \"subhexes\": [");
        for (j = 0; j < h->nsubhexes; j++)
            printf("%s%d", j ? "," : "", (int)h->subhexes[j]);
        printf("],\n");

        print_map_entries("hexmap", h->hexmap, h->nhexmap);
        print_map_edges("hexedges", h->hexedges, h->nhexedges);
        print_map_entries("hexin", h->hexin, h->nhexin);
        print_map_entries("specmap", h->specmap, h->nspecmap);
        print_map_edges("specedges", h->specedges, h->nspecedges);
        print_map_entries("specin", h->specin, h->nspecin);
        print_possibilities("poss", h->poss, h->nposs);

        printf("    }%s\n", i + 1 < lenof(hextables) ? "," : "");
    }
    printf("  ]\n");

    printf("}\n");
    return 0;
}
