/*
 * random-trace.c: characterization-trace generator for random.c.
 *
 * Part of the puzzles-ts port. This program exercises the public
 * random.c API over a curated set of fixtures and emits a JSON
 * corpus to stdout. The TS port replays the corpus against its
 * `src/native/random.ts` implementation and asserts byte-for-byte
 * equality.
 *
 * Build via puzzles/auxiliary/CMakeLists.txt:
 *   cliprogram(random-trace random-trace.c)
 *
 * Usage:
 *   ./random-trace > corpus.json
 *
 * Each fixture exercises one or more of: random_bits (varied widths),
 * random_upto (varied limits, including non-powers-of-two), the
 * pos>=20 SHA rollover path, random_copy independence, and
 * random_state_encode/decode round-trip.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "puzzles.h"

/* ---------------------------------------------------------------------- */
/* Minimal JSON-string escaper. random_state_encode produces hex digits   */
/* only, so we only need to escape backslash and double-quote in the      */
/* seeds — which we keep ASCII anyway — plus pass-through everything else.*/

static void emit_json_string(FILE *out, const char *s)
{
    fputc('"', out);
    for (; *s; s++) {
        unsigned char c = (unsigned char)*s;
        switch (c) {
          case '"':  fputs("\\\"", out); break;
          case '\\': fputs("\\\\", out); break;
          case '\b': fputs("\\b", out); break;
          case '\f': fputs("\\f", out); break;
          case '\n': fputs("\\n", out); break;
          case '\r': fputs("\\r", out); break;
          case '\t': fputs("\\t", out); break;
          default:
            if (c < 0x20)
                fprintf(out, "\\u%04x", c);
            else
                fputc(c, out);
        }
    }
    fputc('"', out);
}

/* ---------------------------------------------------------------------- */
/* Each fixture is a callback that takes a freshly-printed `"calls":`     */
/* opener and emits the call/output array. We keep the recorded data flat */
/* — each element is {op, ..., out} — so the replay can iterate.          */

typedef struct {
    const char *name;
    const char *seed;
    void (*run)(FILE *, random_state *);
} fixture;

static int call_count;

static void start_call(FILE *out)
{
    fputs(call_count++ ? ",\n      " : "\n      ", out);
}

static void emit_bits(FILE *out, random_state *st, int bits)
{
    unsigned long v = random_bits(st, bits);
    start_call(out);
    fprintf(out, "{\"op\":\"bits\",\"bits\":%d,\"out\":%lu}", bits, v);
}

static void emit_upto(FILE *out, random_state *st, unsigned long limit)
{
    unsigned long v = random_upto(st, limit);
    start_call(out);
    fprintf(out, "{\"op\":\"upto\",\"limit\":%lu,\"out\":%lu}", limit, v);
}

/* Replace *stp with a fresh state decoded from *stp's current encoded form. */
static void emit_encode_then_decode_roundtrip(FILE *out, random_state **stp)
{
    char *encoded = random_state_encode(*stp);
    start_call(out);
    fputs("{\"op\":\"encode\",\"out\":", out);
    emit_json_string(out, encoded);
    fputc('}', out);

    random_state *decoded = random_state_decode(encoded);
    random_free(*stp);
    *stp = decoded;
    start_call(out);
    fputs("{\"op\":\"decode\",\"input\":", out);
    emit_json_string(out, encoded);
    fputs(",\"out\":null}", out);
    sfree(encoded);
}

/* ---------------------------------------------------------------------- */
/* Fixtures.                                                              */

/* Mixed small bits-widths, exercises the early databuf path (pos < 20). */
static void fx_mixed_small_bits(FILE *out, random_state *st)
{
    int widths[] = {1, 3, 7, 8, 15, 16, 24, 31};
    int i;
    for (i = 0; i < (int)(sizeof widths / sizeof *widths); i++)
        emit_bits(out, st, widths[i]);
}

/* Verify 32-bit width round-trips through JS Number-precision boundaries. */
static void fx_thirtytwo_bit(FILE *out, random_state *st)
{
    int i;
    for (i = 0; i < 8; i++)
        emit_bits(out, st, 32);
}

/* Power-of-two and non-power-of-two limits, exercising the rejection loop
 * in random_upto. */
static void fx_upto_various(FILE *out, random_state *st)
{
    unsigned long limits[] = {2, 3, 5, 7, 10, 17, 100, 257, 1000, 65537};
    int i;
    for (i = 0; i < (int)(sizeof limits / sizeof *limits); i++)
        emit_upto(out, st, limits[i]);
}

/* Force the pos>=20 SHA rollover. random_bits(8) consumes one databuf
 * byte; 25 calls overshoots the 20-byte buffer once. */
static void fx_sha_rollover(FILE *out, random_state *st)
{
    int i;
    for (i = 0; i < 25; i++)
        emit_bits(out, st, 8);
}

/* random_copy: the copy must advance independently of the original. We
 * record both streams interleaved so a replay catches divergence on
 * either side. */
static void fx_copy_independence(FILE *out, random_state *st)
{
    random_state *copy;
    int i;
    emit_bits(out, st, 16);
    copy = random_copy(st);
    /* Advance the original and the copy alternately. */
    for (i = 0; i < 4; i++) {
        emit_bits(out, st, 16);
        start_call(out);
        fprintf(out, "{\"op\":\"copy_bits\",\"bits\":16,\"out\":%lu}",
                random_bits(copy, 16));
    }
    random_free(copy);
}

/* encode → decode round-trip, then continue calling random_bits to prove
 * the decoded state produces the same subsequent stream. */
static void fx_encode_decode_roundtrip(FILE *out, random_state *st)
{
    random_state *st_local = st;
    /* Advance the state a bit so the encoded form is non-initial. */
    emit_bits(out, st_local, 16);
    emit_bits(out, st_local, 16);

    /* Snapshot, decode it back, continue. The replay compares the
     * post-decode stream against the C-recorded stream. */
    emit_encode_then_decode_roundtrip(out, &st_local);
    emit_bits(out, st_local, 16);
    emit_upto(out, st_local, 100);
    random_free(st_local);
    /* This fixture frees its own state; main() must skip its free(). */
}

static const fixture FIXTURES[] = {
    {"mixed_small_bits",     "fixture-mixed-small-bits-seed", fx_mixed_small_bits},
    {"thirtytwo_bit",        "fixture-thirtytwo-bit-seed",    fx_thirtytwo_bit},
    {"upto_various",         "fixture-upto-various-seed",     fx_upto_various},
    {"sha_rollover",         "fixture-sha-rollover-seed",     fx_sha_rollover},
    {"copy_independence",    "fixture-copy-independence-seed", fx_copy_independence},
    {"encode_decode_roundtrip", "fixture-encode-decode-seed", fx_encode_decode_roundtrip},
};

/* Fixtures that free their own state, so main() skips the free(). */
static int fixture_owns_state(const char *name)
{
    return strcmp(name, "encode_decode_roundtrip") == 0;
}

int main(int argc, char **argv)
{
    (void)argc; (void)argv;
    FILE *out = stdout;
    size_t i;
    int n = (int)(sizeof FIXTURES / sizeof *FIXTURES);

    fputs("{\n  \"version\": 1,\n  \"fixtures\": [\n", out);
    for (i = 0; i < (size_t)n; i++) {
        const fixture *f = &FIXTURES[i];
        random_state *st = random_new(f->seed, (int)strlen(f->seed));
        fputs("    {\n      \"name\": ", out);
        emit_json_string(out, f->name);
        fputs(",\n      \"seed\": ", out);
        emit_json_string(out, f->seed);
        fputs(",\n      \"calls\": [", out);
        call_count = 0;
        f->run(out, st);
        fputs("\n      ]\n    }", out);
        if (i + 1 < (size_t)n) fputc(',', out);
        fputc('\n', out);
        if (!fixture_owns_state(f->name))
            random_free(st);
    }
    fputs("  ]\n}\n", out);
    return 0;
}
