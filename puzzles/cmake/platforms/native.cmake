# Minimal native platform file: enough for cliprogram() to compile the
# characterization harnesses in puzzles/auxiliary/ (the random-trace pattern)
# with the host's native gcc/clang. No GTK, no icon generation, no per-puzzle
# GUI binaries — the wasm webapp is the only product this fork ships, but the
# auxiliary harnesses still need to run on the host to regenerate fixtures.
#
# This file is selected by setup.cmake when emscripten is NOT the active
# toolchain (i.e. CMAKE_SYSTEM_NAME != "Emscripten"). emcmake sets it to
# "Emscripten"; a plain `cmake` invocation leaves the system name at its
# native value, picking this file.

set(platform_common_sources)
set(platform_gui_libs)
set(platform_libs -lm)

# We only need the cliprogram() targets (cliprogram is what
# puzzles/auxiliary/CMakeLists.txt uses for every harness). The puzzle()
# GUI binaries and build_gui_programs path are GTK-only and not relevant
# here.
set(build_individual_puzzles FALSE)
set(build_gui_programs FALSE)

function(get_platform_puzzle_extra_source_files OUTVAR NAME AUXILIARY)
  set(${OUTVAR} "" PARENT_SCOPE)
endfunction()

function(set_platform_gui_target_properties TARGET)
endfunction()

function(set_platform_puzzle_target_properties NAME TARGET)
endfunction()

function(build_platform_extras)
endfunction()
