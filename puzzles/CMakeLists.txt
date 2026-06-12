cmake_minimum_required(VERSION 3.10...3.30)

project(puzzles
  LANGUAGES C)

set(PUZZLES_ROOT_DIR "${CMAKE_CURRENT_LIST_DIR}")
include(cmake/setup.cmake)

# Umbrella flag: turn on every leaf-library TS bridge in one switch. This
# is the primary operator-facing toggle for "give me the hybrid TS+C
# build." Per-module USE_TS_<MODULE> flags below default to this umbrella's
# value and can override it individually. See
# openspec/specs/build-pipeline/spec.md.
option(USE_TS_LEAVES
  "Route every leaf-library call to its TypeScript port (umbrella for USE_TS_<MODULE>)"
  ON)

if(USE_TS_LEAVES)
  set(_default_ts_module ON)
else()
  set(_default_ts_module OFF)
endif()

option(USE_TS_RANDOM
  "Route random_* calls to the TypeScript implementation via --js-library (overrides USE_TS_LEAVES for this module)"
  ${_default_ts_module})

# When USE_TS_RANDOM=ON we drop random.c in favour of the TS bridge, but
# misc.c still needs the SHA_* helpers that live in random.c — so we
# substitute a sha.c that carries just the SHA-1 portion.
if(USE_TS_RANDOM)
  set(random_or_sha_source sha.c)
else()
  set(random_or_sha_source random.c)
endif()

add_library(core_obj OBJECT
  combi.c divvy.c draw-poly.c drawing.c dsf.c findloop.c grid.c
  latin.c laydomino.c loopgen.c malloc.c matching.c midend.c misc.c
  penrose.c penrose-legacy.c ps.c ${random_or_sha_source} sort.c tdq.c tree234.c
  version.c
  ${platform_common_sources})
add_library(core STATIC $<TARGET_OBJECTS:core_obj>)
add_library(common STATIC $<TARGET_OBJECTS:core_obj> hat.c spectre.c)

cliprogram(polygon-test draw-poly.c
  SDL2_LIB COMPILE_DEFINITIONS STANDALONE_POLYGON)

include_directories(${CMAKE_CURRENT_SOURCE_DIR})

puzzle(blackbox
  TS_PORTED  # native-TS port (openspec add-blackbox-ts-port); no blackbox.c/wasm
  DISPLAYNAME "Black Box"
  DESCRIPTION "Ball-finding puzzle"
  OBJECTIVE "Find the hidden balls in the box by bouncing laser beams \
off them.")

puzzle(bridges
  DISPLAYNAME "Bridges"
  DESCRIPTION "Bridge-placing puzzle"
  OBJECTIVE "Connect all the islands with a network of bridges.")

puzzle(cube
  TS_PORTED  # native-TS port (openspec add-cube-ts-port); no cube.c/wasm
  DISPLAYNAME "Cube"
  DESCRIPTION "Rolling cube puzzle"
  OBJECTIVE "Pick up all the blue squares by rolling the cube over them.")

puzzle(dominosa
  DISPLAYNAME "Dominosa"
  DESCRIPTION "Domino tiling puzzle"
  OBJECTIVE "Tile the rectangle with a full set of dominoes.")
solver(dominosa)

puzzle(fifteen
  TS_PORTED  # native-TS port (openspec add-fifteen-ts-port); no fifteen.c/wasm
  DISPLAYNAME "Fifteen"
  DESCRIPTION "Sliding block puzzle"
  OBJECTIVE "Slide the tiles around to arrange them into order.")

puzzle(filling
  DISPLAYNAME "Filling"
  DESCRIPTION "Polyomino puzzle"
  OBJECTIVE "Mark every square with the area of its containing region.")
solver(filling)

puzzle(flip
  TS_PORTED  # native-TS port (openspec add-flip-ts-port); no flip.c/wasm
  DISPLAYNAME "Flip"
  DESCRIPTION "Tile inversion puzzle"
  OBJECTIVE "Flip groups of squares to light them all up at once.")

puzzle(flood
  TS_PORTED  # native-TS port (openspec add-flood-ts-port); no flood.c/wasm
  DISPLAYNAME "Flood"
  DESCRIPTION "Flood-filling puzzle"
  OBJECTIVE "Turn the grid the same colour in as few flood fills as possible.")

puzzle(galaxies
  TS_PORTED  # native-TS port (openspec add-galaxies-ts-port); no galaxies.c/wasm
  DISPLAYNAME "Galaxies"
  DESCRIPTION "Symmetric polyomino puzzle"
  OBJECTIVE "Divide the grid into rotationally symmetric regions each \
centred on a dot.")

puzzle(guess
  TS_PORTED  # native-TS port (openspec add-guess-ts-port); no guess.c/wasm
  DISPLAYNAME "Guess"
  DESCRIPTION "Combination-guessing puzzle"
  OBJECTIVE "Guess the hidden combination of colours.")

puzzle(inertia
  DISPLAYNAME "Inertia"
  DESCRIPTION "Gem-collecting puzzle"
  OBJECTIVE "Collect all the gems without running into any of the mines.")

puzzle(keen
  DISPLAYNAME "Keen"
  DESCRIPTION "Arithmetic Latin square puzzle"
  OBJECTIVE "Complete the latin square in accordance with the \
arithmetic clues.")
solver(keen latin.c)

puzzle(lightup
  DISPLAYNAME "Light Up"
  DESCRIPTION "Light-bulb placing puzzle"
  OBJECTIVE "Place bulbs to light up all the squares.")
solver(lightup)

puzzle(loopy
  DISPLAYNAME "Loopy"
  DESCRIPTION "Loop-drawing puzzle"
  OBJECTIVE "Draw a single closed loop, given clues about number of \
adjacent edges.")
solver(loopy)

puzzle(magnets
  DISPLAYNAME "Magnets"
  DESCRIPTION "Magnet-placing puzzle"
  OBJECTIVE "Place magnets to satisfy the clues and avoid like poles \
touching.")
solver(magnets)

puzzle(map
  DISPLAYNAME "Map"
  DESCRIPTION "Map-colouring puzzle"
  OBJECTIVE "Colour the map so that adjacent regions are never the \
same colour.")
solver(map)

puzzle(mines
  DISPLAYNAME "Mines"
  DESCRIPTION "Mine-finding puzzle"
  OBJECTIVE "Find all the mines without treading on any of them.")
cliprogram(mineobfusc mines.c COMPILE_DEFINITIONS STANDALONE_OBFUSCATOR)

puzzle(mosaic
  DISPLAYNAME "Mosaic"
  DESCRIPTION "Grid-filling puzzle"
  OBJECTIVE "Fill in the grid given clues about number of \
nearby black squares.")

puzzle(net
  # The Windows Net shouldn't be called 'net.exe', since Windows
  # already has a reasonably important utility program by that name!
  WINDOWS_EXE_NAME netgame

  DISPLAYNAME "Net"
  DESCRIPTION "Network jigsaw puzzle"
  OBJECTIVE "Rotate each tile to reassemble the network.")

puzzle(netslide
  DISPLAYNAME "Netslide"
  DESCRIPTION "Toroidal sliding network puzzle"
  OBJECTIVE "Slide a row at a time to reassemble the network.")

puzzle(nullgame)

puzzle(palisade
  DISPLAYNAME "Palisade"
  DESCRIPTION "Grid-division puzzle"
  OBJECTIVE "Divide the grid into equal-sized areas in accordance with\
 the clues.")

puzzle(pattern
  DISPLAYNAME "Pattern"
  DESCRIPTION "Pattern puzzle"
  OBJECTIVE "Fill in the pattern in the grid, given only the lengths \
of runs of black squares.")
solver(pattern)
cliprogram(patternpicture pattern.c
  COMPILE_DEFINITIONS STANDALONE_PICTURE_GENERATOR)

puzzle(pearl
  DISPLAYNAME "Pearl"
  DESCRIPTION "Loop-drawing puzzle"
  OBJECTIVE "Draw a single closed loop, given clues about corner and \
straight squares.")
solver(pearl)
cliprogram(pearlbench pearl.c COMPILE_DEFINITIONS STANDALONE_SOAK_TEST)

puzzle(pegs
  TS_PORTED  # native-TS port (openspec add-pegs-ts-port); no pegs.c/wasm
  DISPLAYNAME "Pegs"
  DESCRIPTION "Peg solitaire puzzle"
  OBJECTIVE "Jump pegs over each other to remove all but one.")

puzzle(range
  DISPLAYNAME "Range"
  DESCRIPTION "Visible-distance puzzle"
  OBJECTIVE "Place black squares to limit the visible distance from \
each numbered cell.")

puzzle(rect
  DISPLAYNAME "Rectangles"
  DESCRIPTION "Rectangles puzzle"
  OBJECTIVE "Divide the grid into rectangles with areas equal to the \
numbers.")

puzzle(samegame
  DISPLAYNAME "Same Game"
  DESCRIPTION "Block-clearing puzzle"
  OBJECTIVE "Clear the grid by removing touching groups of the same \
colour squares."
  TS_PORTED  # native-TS port (openspec add-samegame-ts-port); no samegame.c/wasm
)

puzzle(signpost
  DISPLAYNAME "Signpost"
  DESCRIPTION "Square-connecting puzzle"
  OBJECTIVE "Connect the squares into a path following the arrows.")
solver(signpost)

puzzle(singles
  DISPLAYNAME "Singles"
  DESCRIPTION "Number-removing puzzle"
  OBJECTIVE "Black out the right set of duplicate numbers.")
solver(singles)

puzzle(sixteen
  TS_PORTED  # native-TS port (openspec add-sixteen-ts-port); no sixteen.c/wasm
  DISPLAYNAME "Sixteen"
  DESCRIPTION "Toroidal sliding block puzzle"
  OBJECTIVE "Slide a row at a time to arrange the tiles into order.")

puzzle(slant
  DISPLAYNAME "Slant"
  DESCRIPTION "Maze-drawing puzzle"
  OBJECTIVE "Draw a maze of slanting lines that matches the clues.")
solver(slant)

puzzle(solo
  DISPLAYNAME "Solo"
  DESCRIPTION "Number placement puzzle"
  OBJECTIVE "Fill in the grid so that each row, column and square \
block contains one of every digit.")
solver(solo)

puzzle(tents
  DISPLAYNAME "Tents"
  DESCRIPTION "Tent-placing puzzle"
  OBJECTIVE "Place a tent next to each tree.")
solver(tents)

puzzle(towers
  DISPLAYNAME "Towers"
  DESCRIPTION "Tower-placing Latin square puzzle"
  OBJECTIVE "Complete the latin square of towers in accordance with \
the clues.")
solver(towers latin.c)

puzzle(tracks
  DISPLAYNAME "Tracks"
  DESCRIPTION "Path-finding railway track puzzle"
  OBJECTIVE "Fill in the railway track according to the clues.")
solver(tracks)

puzzle(twiddle
  TS_PORTED  # native-TS port (openspec add-twiddle-ts-port); no twiddle.c/wasm
  DISPLAYNAME "Twiddle"
  DESCRIPTION "Rotational sliding block puzzle"
  OBJECTIVE "Rotate the tiles around themselves to arrange them into order.")

puzzle(undead
  DISPLAYNAME "Undead"
  DESCRIPTION "Monster-placing puzzle"
  OBJECTIVE "Place ghosts, vampires and zombies so that the right \
numbers of them can be seen in mirrors.")

puzzle(unequal
  DISPLAYNAME "Unequal"
  DESCRIPTION "Latin square puzzle"
  OBJECTIVE "Complete the latin square in accordance with the > signs.")
solver(unequal latin.c)

puzzle(unruly
  DISPLAYNAME "Unruly"
  DESCRIPTION "Black and white grid puzzle"
  OBJECTIVE "Fill in the black and white grid to avoid runs of three.")
solver(unruly)

puzzle(untangle
  DISPLAYNAME "Untangle"
  DESCRIPTION "Planar graph layout puzzle"
  OBJECTIVE "Reposition the points so that the lines do not cross.")
guiprogram(grapheditor untangle.c
  COMPILE_DEFINITIONS EDITOR)

add_subdirectory(unfinished)
add_subdirectory(unreleased)
add_subdirectory(auxiliary)

if(build_cli_programs)
  write_generated_games_header()
  include(CheckFunctionExists)
  check_function_exists(HF_ITER HAVE_HF_ITER)
  set(WITH_LIBFUZZER OFF
    CACHE BOOL "Build fuzzpuzz using Clang's libFuzzer")
  cliprogram(fuzzpuzz fuzzpuzz.c list.c ${puzzle_sources}
    COMPILE_DEFINITIONS COMBINED $<$<BOOL:${WITH_LIBFUZZER}>:OMIT_MAIN>
    $<$<BOOL:${HAVE_HF_ITER}>:HAVE_HF_ITER>)
  target_include_directories(fuzzpuzz PRIVATE ${generated_include_dir})
  if(WITH_LIBFUZZER)
    target_compile_options(fuzzpuzz PRIVATE -fsanitize=fuzzer)
    set_target_properties(fuzzpuzz PROPERTIES LINK_FLAGS -fsanitize=fuzzer)
  endif()
endif()

build_extras()
