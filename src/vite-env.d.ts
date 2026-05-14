/// <reference types="vite/client" />

interface ViteTypeOptions {
  // Makes the type of ImportMetaEnv strict to disallow unknown keys.
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_ANALYTICS_BLOCK: string; // raw html injected in pages
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_CANONICAL_BASE_URL: string;
  readonly VITE_GIT_SHA?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_FILTER_APPLICATION_ID?: string;
  // Umbrella flag for the per-module VITE_USE_TS_<MODULE> family. When
  // truthy, every per-module flag below defaults to truthy; per-module
  // env vars override individually. Pairs with -DUSE_TS_LEAVES=ON on
  // the CMake side. See openspec/specs/build-pipeline/spec.md.
  readonly VITE_USE_TS_LEAVES?: string;
  // Per-module override for the random bridge. Set when the WASM was
  // built with -DUSE_TS_RANDOM=ON; installs the JS-side random bridge
  // on the Emscripten Module. Distinct from "unset" (inherits umbrella)
  // and "explicit 0/false/off" (forces OFF even under the umbrella).
  readonly VITE_USE_TS_RANDOM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __PUZZLE_IDS__: string[];
