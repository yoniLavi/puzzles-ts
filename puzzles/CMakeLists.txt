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
  combi.c draw-poly.c drawing.c dsf.c findloop.c grid.c
  latin.c loopgen.c malloc.c matching.c midend.c misc.c
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
  TS_PORTED  # native-TS port (openspec add-bridges-ts-port); no bridges.c/wasm
  DISPLAYNAME "Bridges"
  DESCRIPTION "Bridge-placing puzzle"
  OBJECTIVE "Connect all the islands with a network of bridges.")

puzzle(cube
  TS_PORTED  # native-TS port (openspec add-cube-ts-port); no cube.c/wasm
  DISPLAYNAME "Cube"
  DESCRIPTION "Rolling cube puzzle"
  OBJECTIVE "Pick up all the blue squares by rolling the cube over them.")

puzzle(dominosa
  TS_PORTED  # native-TS port (openspec add-dominosa-ts-port); no dominosa.c/wasm
  DISPLAYNAME "Dominosa"
  DESCRIPTION "Domino tiling puzzle"
  OBJECTIVE "Tile the rectangle with a full set of dominoes.")

puzzle(fifteen
  TS_PORTED  # native-TS port (openspec add-fifteen-ts-port); no fifteen.c/wasm
  DISPLAYNAME "Fifteen"
  DESCRIPTION "Sliding block puzzle"
  OBJECTIVE "Slide the tiles around to arrange them into order.")

puzzle(filling
  TS_PORTED  # native-TS port (openspec add-filling-ts-port); no filling.c/wasm
  DISPLAYNAME "Filling"
  DESCRIPTION "Polyomino puzzle"
  OBJECTIVE "Mark every square with the area of its containing region.")

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
  TS_PORTED  # native-TS port (openspec add-inertia-ts-port); no inertia.c/wasm
  DISPLAYNAME "Inertia"
  DESCRIPTION "Gem-collecting puzzle"
  OBJECTIVE "Collect all the gems without running into any of the mines.")

puzzle(keen
  TS_PORTED  # native-TS port (openspec add-keen-ts-port); no keen.c/wasm
  DISPLAYNAME "Keen"
  DESCRIPTION "Arithmetic Latin square puzzle"
  OBJECTIVE "Complete the latin square in accordance with the \
arithmetic clues.")

puzzle(lightup
  TS_PORTED  # native-TS port (openspec add-lightup-ts-port); no lightup.c/wasm
  DISPLAYNAME "Light Up"
  DESCRIPTION "Light-bulb placing puzzle"
  OBJECTIVE "Place bulbs to light up all the squares.")

puzzle(loopy
  DISPLAYNAME "Loopy"
  DESCRIPTION "Loop-drawing puzzle"
  OBJECTIVE "Draw a single closed loop, given clues about number of \
adjacent edges.")
solver(loopy)

puzzle(magnets
  TS_PORTED  # native-TS port (openspec add-magnets-ts-port); no magnets.c/wasm
  DISPLAYNAME "Magnets"
  DESCRIPTION "Magnet-placing puzzle"
  OBJECTIVE "Place magnets to satisfy the clues and avoid like poles \
touching.")

puzzle(map
  TS_PORTED  # native-TS port (openspec add-map-ts-port); no map.c/wasm
  DISPLAYNAME "Map"
  DESCRIPTION "Map-colouring puzzle"
  OBJECTIVE "Colour the map so that adjacent regions are never the \
same colour.")

puzzle(mines
  TS_PORTED  # native-TS port (openspec add-mines-ts-port); no mines.c/wasm
  DISPLAYNAME "Mines"
  DESCRIPTION "Mine-finding puzzle"
  OBJECTIVE "Find all the mines without treading on any of them.")

puzzle(mosaic
  TS_PORTED  # native-TS port (openspec add-mosaic-ts-port); no mosaic.c/wasm
  DISPLAYNAME "Mosaic"
  DESCRIPTION "Grid-filling puzzle"
  OBJECTIVE "Fill in the grid given clues about number of \
nearby black squares.")

puzzle(net
  TS_PORTED  # native-TS port (openspec add-net-ts-port); no net.c/wasm

  # The Windows Net shouldn't be called 'net.exe', since Windows
  # already has a reasonably important utility program by that name!
  WINDOWS_EXE_NAME netgame

  DISPLAYNAME "Net"
  DESCRIPTION "Network jigsaw puzzle"
  OBJECTIVE "Rotate each tile to reassemble the network.")

puzzle(netslide
  TS_PORTED  # native-TS port (openspec add-netslide-ts-port); no netslide.c/wasm
  DISPLAYNAME "Netslide"
  DESCRIPTION "Toroidal sliding network puzzle"
  OBJECTIVE "Slide a row at a time to reassemble the network.")

puzzle(nullgame)

puzzle(palisade
  TS_PORTED  # native-TS port (openspec add-palisade-ts-port); no palisade.c/wasm
  DISPLAYNAME "Palisade"
  DESCRIPTION "Grid-division puzzle"
  OBJECTIVE "Divide the grid into equal-sized areas in accordance with\
 the clues.")

puzzle(pattern
  TS_PORTED  # native-TS port (openspec add-pattern-ts-port); no pattern.c/wasm
  DISPLAYNAME "Pattern"
  DESCRIPTION "Pattern puzzle"
  OBJECTIVE "Fill in the pattern in the grid, given only the lengths \
of runs of black squares.")

puzzle(pearl
  TS_PORTED  # native-TS port (openspec add-pearl-ts-port); no pearl.c/wasm
  DISPLAYNAME "Pearl"
  DESCRIPTION "Loop-drawing puzzle"
  OBJECTIVE "Draw a single closed loop, given clues about corner and \
straight squares.")

puzzle(pegs
  TS_PORTED  # native-TS port (openspec add-pegs-ts-port); no pegs.c/wasm
  DISPLAYNAME "Pegs"
  DESCRIPTION "Peg solitaire puzzle"
  OBJECTIVE "Jump pegs over each other to remove all but one.")

puzzle(range
  TS_PORTED  # native-TS port (openspec add-range-ts-port); no range.c/wasm
  DISPLAYNAME "Range"
  DESCRIPTION "Visible-distance puzzle"
  OBJECTIVE "Place black squares to limit the visible distance from \
each numbered cell.")

puzzle(rect
  TS_PORTED  # native-TS port (openspec add-rect-ts-port); no rect.c/wasm
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

puzzle(separate
  TS_PORTED  # native-TS port (openspec add-separate-ts-port); no separate.c/wasm.
             # Finishes upstream's unfinished puzzle; was in unfinished/.
  DISPLAYNAME "Separate"
  DESCRIPTION "Rectangle-dividing puzzle"
  OBJECTIVE "Partition the grid into regions containing one of each letter.")

puzzle(signpost
  TS_PORTED  # native-TS port (openspec add-signpost-ts-port); no signpost.c/wasm
  DISPLAYNAME "Signpost"
  DESCRIPTION "Square-connecting puzzle"
  OBJECTIVE "Connect the squares into a path following the arrows.")

puzzle(singles
  TS_PORTED  # native-TS port (openspec add-singles-ts-port); no singles.c/wasm
  DISPLAYNAME "Singles"
  DESCRIPTION "Number-removing puzzle"
  OBJECTIVE "Black out the right set of duplicate numbers.")

puzzle(sixteen
  TS_PORTED  # native-TS port (openspec add-sixteen-ts-port); no sixteen.c/wasm
  DISPLAYNAME "Sixteen"
  DESCRIPTION "Toroidal sliding block puzzle"
  OBJECTIVE "Slide a row at a time to arrange the tiles into order.")

puzzle(slant
  TS_PORTED  # native-TS port (openspec add-slant-ts-port); no slant.c/wasm
  DISPLAYNAME "Slant"
  DESCRIPTION "Maze-drawing puzzle"
  OBJECTIVE "Draw a maze of slanting lines that matches the clues.")

puzzle(solo
  TS_PORTED  # native-TS port (openspec add-solo-ts-port); no solo.c/wasm
  DISPLAYNAME "Solo"
  DESCRIPTION "Number placement puzzle"
  OBJECTIVE "Fill in the grid so that each row, column and square \
block contains one of every digit.")

puzzle(tents
  TS_PORTED  # native-TS port (openspec add-tents-ts-port); no tents.c/wasm
  DISPLAYNAME "Tents"
  DESCRIPTION "Tent-placing puzzle"
  OBJECTIVE "Place a tent next to each tree.")

puzzle(towers
  TS_PORTED  # native-TS port (openspec add-towers-ts-port); no towers.c/wasm
  DISPLAYNAME "Towers"
  DESCRIPTION "Tower-placing Latin square puzzle"
  OBJECTIVE "Complete the latin square of towers in accordance with \
the clues.")

puzzle(tracks
  TS_PORTED  # native-TS port (openspec add-tracks-ts-port); no tracks.c/wasm
  DISPLAYNAME "Tracks"
  DESCRIPTION "Path-finding railway track puzzle"
  OBJECTIVE "Fill in the railway track according to the clues.")

puzzle(twiddle
  TS_PORTED  # native-TS port (openspec add-twiddle-ts-port); no twiddle.c/wasm
  DISPLAYNAME "Twiddle"
  DESCRIPTION "Rotational sliding block puzzle"
  OBJECTIVE "Rotate the tiles around themselves to arrange them into order.")

puzzle(undead
  TS_PORTED  # native-TS port (openspec add-undead-ts-port); no undead.c/wasm
  DISPLAYNAME "Undead"
  DESCRIPTION "Monster-placing puzzle"
  OBJECTIVE "Place ghosts, vampires and zombies so that the right \
numbers of them can be seen in mirrors.")

puzzle(unequal
  TS_PORTED  # native-TS port (openspec add-unequal-ts-port); no unequal.c/wasm
  DISPLAYNAME "Unequal"
  DESCRIPTION "Latin square puzzle"
  OBJECTIVE "Complete the latin square in accordance with the > signs.")

puzzle(unruly
  TS_PORTED  # native-TS port (openspec add-unruly-ts-port); no unruly.c/wasm
  DISPLAYNAME "Unruly"
  DESCRIPTION "Black and white grid puzzle"
  OBJECTIVE "Fill in the black and white grid to avoid runs of three.")

puzzle(untangle
  TS_PORTED  # native-TS port (openspec add-untangle-ts-port); no untangle.c/wasm
  DISPLAYNAME "Untangle"
  DESCRIPTION "Planar graph layout puzzle"
  OBJECTIVE "Reposition the points so that the lines do not cross.")
# (The upstream `grapheditor` GTK editor built untangle.c with -DEDITOR; the
#  editor is excluded from this fork and untangle.c is deleted with this port.)

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
