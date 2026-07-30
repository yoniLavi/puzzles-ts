# Group is a native-TS game in the main catalog (openspec add-group-ts-port);
# group.c and group.gap were deleted at stage-2 acceptance.
#
# Sokoban is a native-TS game in the main catalog (openspec
# add-sokoban-ts-port); its puzzle() moved to the main CMakeLists with
# TS_PORTED, and sokoban.c (+ the sokoban-trace harness) were deleted at
# stage-2 acceptance.

# Slide is a native-TS game in the main catalog (openspec add-slide-ts-port); its
# puzzle() moved to the main CMakeLists with TS_PORTED, and slide.c (+ the
# slide-trace harness) were deleted at stage-2 acceptance.
#
# No puzzle() remains in this directory: every game that was here is now a
# native-TS port in the main catalog, so this subdirectory builds no wasm at all.

# These unfinished programs don't even have the structure of a puzzle
# game yet; they're just command-line programs containing test
# implementations of some of the needed functionality.

cliprogram(numgame numgame.c)

cliprogram(path path.c COMPILE_DEFINITIONS TEST_GEN)

export_variables_to_parent_scope()
