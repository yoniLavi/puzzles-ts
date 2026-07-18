/*
 * grid-trace.c — differential-check harness for the TypeScript port of
 * grid.c (openspec change `extend-grid-tilings`).
 *
 * Dumps the COMPLETE incidence of a generated grid as JSON: the tile size,
 * the bounding box, every dot with its coordinates, every edge with its two
 * dots and two faces, and every face with its clockwise dot and edge rings.
 *
 * Indices, not just shape, are compared against the TS port. Dot indices are
 * assigned in first-encounter order driven by each generator's own emission
 * loop, so index-exact agreement proves the *emission order* matches — a
 * transposed coordinate or a swapped face-corner order shows up immediately,
 * where a shape-only comparison would let it through.
 *
 * A null face reference (the infinite exterior) is emitted as -1.
 *
 * Usage:  grid-trace <type> <width> <height> [desc]
 *         grid-trace --all
 *         grid-trace --incentres
 *
 * <type> is a GRIDGEN_LIST name, lowercased (square, honeycomb, ...).
 * --all emits the whole fixture matrix used by grid-differential.test.ts.
 * --incentres emits, for that same fixture matrix, each face's incentre —
 * a separate mode writing a separate fixture, consumed by
 * grid-incentre.test.ts. --all's output is unchanged by it.
 *
 * This is OUR file (not upstream's) — edit freely per AGENTS.md.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

#include "../grid.c"

/* Names parallel to GRIDGEN_LIST, in grid_type order. */
#define NAME(upper, lower) #lower,
static const char *const gridnames[] = { GRIDGEN_LIST(NAME) };
#undef NAME

static int index_of(const grid_dot *d) { return d ? d->index : -1; }
static int face_index_of(const grid_face *f) { return f ? f->index : -1; }

static void dump_grid(const char *typename, grid_type type,
                      int w, int h, const char *desc)
{
    grid *g;
    int i, j;
    int tilesize, xextent, yextent;

    grid_compute_size(type, w, h, &tilesize, &xextent, &yextent);
    g = grid_new(type, w, h, desc);

    printf("{\n");
    printf("  \"type\": \"%s\",\n", typename);
    printf("  \"width\": %d,\n", w);
    printf("  \"height\": %d,\n", h);
    if (desc)
        printf("  \"desc\": \"%s\",\n", desc);
    else
        printf("  \"desc\": null,\n");

    /* grid_compute_size is a static function of (type,w,h); the grid's own
     * tilesize must agree with it. Assert rather than emit both. */
    assert(g->tilesize == tilesize);
    printf("  \"tileSize\": %d,\n", g->tilesize);
    printf("  \"computedExtent\": [%d, %d],\n", xextent, yextent);
    printf("  \"boundingBox\": [%d, %d, %d, %d],\n",
           g->lowest_x, g->lowest_y, g->highest_x, g->highest_y);

    printf("  \"dots\": [");
    for (i = 0; i < g->num_dots; i++) {
        grid_dot *d = g->dots[i];
        assert(d->index == i);
        printf("%s[%d, %d]", i ? ", " : "", d->x, d->y);
    }
    printf("],\n");

    /* Each edge as [dot1, dot2, face1, face2]; -1 face = infinite exterior. */
    printf("  \"edges\": [");
    for (i = 0; i < g->num_edges; i++) {
        grid_edge *e = g->edges[i];
        assert(e->index == i);
        printf("%s[%d, %d, %d, %d]", i ? ", " : "",
               index_of(e->dot1), index_of(e->dot2),
               face_index_of(e->face1), face_index_of(e->face2));
    }
    printf("],\n");

    /* Each face as {order, dots[], edges[]}, both rings clockwise. */
    printf("  \"faces\": [");
    for (i = 0; i < g->num_faces; i++) {
        grid_face *f = g->faces[i];
        assert(f->index == i);
        printf("%s{\"order\": %d, \"dots\": [", i ? ", " : "", f->order);
        for (j = 0; j < f->order; j++)
            printf("%s%d", j ? ", " : "", index_of(f->dots[j]));
        printf("], \"edges\": [");
        for (j = 0; j < f->order; j++)
            printf("%s%d", j ? ", " : "", f->edges[j] ? f->edges[j]->index : -1);
        printf("]}");
    }
    printf("],\n");

    /* Per-dot rings. These are derived by grid_make_consistent and are the
     * part the dline machinery in loopy.c depends on being exactly right. */
    printf("  \"dotRings\": [");
    for (i = 0; i < g->num_dots; i++) {
        grid_dot *d = g->dots[i];
        printf("%s{\"order\": %d, \"edges\": [", i ? ", " : "", d->order);
        for (j = 0; j < d->order; j++)
            printf("%s%d", j ? ", " : "", d->edges[j] ? d->edges[j]->index : -1);
        printf("], \"faces\": [");
        for (j = 0; j < d->order; j++)
            printf("%s%d", j ? ", " : "", face_index_of(d->faces[j]));
        printf("]}");
    }
    printf("]\n");

    printf("}");
    grid_free(g);
}

/*
 * Incentres: a SEPARATE output mode writing a SEPARATE fixture file.
 *
 * Deliberately not folded into dump_grid's output — grid-c-reference.json is
 * the index-exact incidence differential and must stay byte-stable while the
 * tiling ports land. Incentres are float display geometry with their own,
 * property-based (not exact) comparison, so they get their own fixture.
 */
static void dump_incentres(const char *typename, grid_type type,
                           int w, int h, const char *desc)
{
    grid *g = grid_new(type, w, h, desc);
    int i;

    printf("{\n");
    printf("  \"type\": \"%s\",\n", typename);
    printf("  \"width\": %d,\n", w);
    printf("  \"height\": %d,\n", h);
    if (desc)
        printf("  \"desc\": \"%s\",\n", desc);
    else
        printf("  \"desc\": null,\n");

    printf("  \"incentres\": [");
    for (i = 0; i < g->num_faces; i++) {
        grid_face *f = g->faces[i];
        grid_find_incentre(f);
        printf("%s[%d, %d]", i ? ", " : "", f->ix, f->iy);
    }
    printf("]\n");

    printf("}");
    grid_free(g);
}

/*
 * The fixture matrix. Three sizes per periodic tiling:
 *
 *   - its MINIMUM legal size (per loopy.c's GRIDLIST amin/omin), where the
 *     boundary-guard branches (`if (y > 0)`, `if (x > 0)`, the edge-condition
 *     face kinds in greathexagonal/cairo/kagome) are mostly *active*;
 *   - a MID size with at least one fully-interior cell, where those same
 *     guards are mostly *inactive* — the complementary path;
 *   - a NON-SQUARE size, which catches a transposed w/h.
 *
 * Deliberately no 10x10-and-up sizes. This differential exists to catch
 * coordinate transcription typos in 13 hand-ported generators, and a typo
 * shows up at minimum size exactly as well as at scale — larger grids add
 * fixture bulk (the dump is full geometry, not a desc string) without adding
 * a code path. 4x4-ish is enough for an interior cell in every tiling here.
 *
 * The four aperiodic tilings are deliberately absent — they are RNG-bearing
 * and land in the `add-aperiodic-tilings` change.
 */
struct fixture { grid_type type; int w, h; const char *desc; };

static const struct fixture fixtures[] = {
    { GRID_SQUARE,                3,  3, NULL },
    { GRID_SQUARE,                5,  5, NULL },
    { GRID_SQUARE,                5,  3, NULL },
    { GRID_HONEYCOMB,             3,  3, NULL },
    { GRID_HONEYCOMB,             5,  5, NULL },
    { GRID_HONEYCOMB,             3,  5, NULL },
    /* Triangular in BOTH desc modes: absent = legacy ragged-ear algorithm,
     * "0" = current ear-trimmed one. They genuinely differ (3x3 gives 18 vs
     * 19 faces), and old shared game IDs select the legacy one. */
    { GRID_TRIANGULAR,            3,  3, NULL },
    { GRID_TRIANGULAR,            3,  3, "0"  },
    { GRID_TRIANGULAR,            5,  4, NULL },
    { GRID_TRIANGULAR,            5,  4, "0"  },
    { GRID_TRIANGULAR,            4,  5, "0"  },
    { GRID_SNUBSQUARE,            3,  3, NULL },
    { GRID_SNUBSQUARE,            5,  5, NULL },
    { GRID_SNUBSQUARE,            4,  6, NULL },
    { GRID_CAIRO,                 3,  4, NULL },
    { GRID_CAIRO,                 5,  5, NULL },
    { GRID_CAIRO,                 4,  6, NULL },
    { GRID_GREATHEXAGONAL,        3,  3, NULL },
    { GRID_GREATHEXAGONAL,        5,  4, NULL },
    { GRID_GREATHEXAGONAL,        4,  5, NULL },
    { GRID_KAGOME,                3,  3, NULL },
    { GRID_KAGOME,                5,  4, NULL },
    { GRID_KAGOME,                4,  5, NULL },
    { GRID_OCTAGONAL,             3,  3, NULL },
    { GRID_OCTAGONAL,             5,  5, NULL },
    { GRID_OCTAGONAL,             4,  6, NULL },
    { GRID_KITE,                  3,  3, NULL },
    { GRID_KITE,                  4,  4, NULL },
    { GRID_KITE,                  3,  5, NULL },
    { GRID_FLORET,                1,  2, NULL },
    { GRID_FLORET,                3,  3, NULL },
    { GRID_FLORET,                2,  4, NULL },
    { GRID_DODECAGONAL,           2,  2, NULL },
    { GRID_DODECAGONAL,           4,  4, NULL },
    { GRID_DODECAGONAL,           3,  5, NULL },
    { GRID_GREATDODECAGONAL,      2,  2, NULL },
    { GRID_GREATDODECAGONAL,      4,  4, NULL },
    { GRID_GREATDODECAGONAL,      3,  5, NULL },
    /* NOTE: greatgreatdodecagonal is symmetric under transposition (5x3 and
     * 3x5 give identical counts), so the non-square rung is weaker here than
     * elsewhere — it cannot catch a transposed w/h. Kept for the interior
     * coverage; do not read it as transposition coverage. */
    { GRID_GREATGREATDODECAGONAL, 2,  2, NULL },
    { GRID_GREATGREATDODECAGONAL, 4,  4, NULL },
    { GRID_GREATGREATDODECAGONAL, 3,  5, NULL },
    { GRID_COMPASSDODECAGONAL,    2,  2, NULL },
    { GRID_COMPASSDODECAGONAL,    4,  4, NULL },
    { GRID_COMPASSDODECAGONAL,    3,  5, NULL },
};

int main(int argc, char **argv)
{
    size_t i;

    if (argc == 2 && !strcmp(argv[1], "--all")) {
        printf("[\n");
        for (i = 0; i < lenof(fixtures); i++) {
            const struct fixture *f = &fixtures[i];
            if (i) printf(",\n");
            dump_grid(gridnames[f->type], f->type, f->w, f->h, f->desc);
        }
        printf("\n]\n");
        return 0;
    }

    if (argc == 2 && !strcmp(argv[1], "--incentres")) {
        printf("[\n");
        for (i = 0; i < lenof(fixtures); i++) {
            const struct fixture *f = &fixtures[i];
            if (i) printf(",\n");
            dump_incentres(gridnames[f->type], f->type, f->w, f->h, f->desc);
        }
        printf("\n]\n");
        return 0;
    }

    if (argc >= 4) {
        const char *typename = argv[1];
        int w = atoi(argv[2]);
        int h = atoi(argv[3]);
        const char *desc = argc > 4 ? argv[4] : NULL;
        for (i = 0; i < lenof(gridnames); i++) {
            if (!strcmp(typename, gridnames[i])) {
                dump_grid(gridnames[i], (grid_type)i, w, h, desc);
                printf("\n");
                return 0;
            }
        }
        fprintf(stderr, "grid-trace: unknown grid type '%s'\n", typename);
        return 1;
    }

    fprintf(stderr,
            "usage: grid-trace <type> <width> <height> [desc]\n"
            "       grid-trace --all\n"
            "       grid-trace --incentres\n");
    return 1;
}
