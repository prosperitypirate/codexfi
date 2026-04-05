# Changelog

## [0.5.4](https://github.com/prosperitypirate/codexfi/compare/v0.5.3...v0.5.4) (2026-04-05)


### Bug Fixes

* revert db.ts to simple createRequire — 0.5.3 broke lancedb loading ([#148](https://github.com/prosperitypirate/codexfi/issues/148)) ([9e76ab7](https://github.com/prosperitypirate/codexfi/commit/9e76ab7854c4f79851c8d09cde072ecd903cb617)), closes [#147](https://github.com/prosperitypirate/codexfi/issues/147)

## [0.5.3](https://github.com/prosperitypirate/codexfi/compare/v0.5.2...v0.5.3) (2026-04-05)


### Bug Fixes

* use dynamic import() for @lancedb/lancedb instead of createRequire ([#145](https://github.com/prosperitypirate/codexfi/issues/145)) ([0d2e52e](https://github.com/prosperitypirate/codexfi/commit/0d2e52e7f13d8d2fa31fc3d2e67dc2ae1c48609a)), closes [#144](https://github.com/prosperitypirate/codexfi/issues/144)

## [0.5.2](https://github.com/prosperitypirate/codexfi/compare/v0.5.1...v0.5.2) (2026-04-05)


### Bug Fixes

* **plugin:** use createRequire to resolve @lancedb/lancedb from dist path (fixes [#141](https://github.com/prosperitypirate/codexfi/issues/141)) ([#142](https://github.com/prosperitypirate/codexfi/issues/142)) ([64699cd](https://github.com/prosperitypirate/codexfi/commit/64699cde81635209ac831379872630d8d8deb3dd))

## [0.5.1](https://github.com/prosperitypirate/codexfi/compare/v0.5.0...v0.5.1) (2026-03-08)


### Bug Fixes

* **config:** add extractionProvider field to codexfi.jsonc ([#122](https://github.com/prosperitypirate/codexfi/issues/122)) ([a0abd9c](https://github.com/prosperitypirate/codexfi/commit/a0abd9ca094e9d505fb0beb378ce137f7283c535)), closes [#121](https://github.com/prosperitypirate/codexfi/issues/121)

## [0.5.0](https://github.com/prosperitypirate/codexfi/compare/v0.4.7...v0.5.0) (2026-03-07)


### Features

* **memory:** fix auto-init extraction mode and Turn 1 visibility ([#115](https://github.com/prosperitypirate/codexfi/issues/115)) ([f505ff9](https://github.com/prosperitypirate/codexfi/commit/f505ff9e9d22d66f8eb1f86630e9aa9e78fe565c))

## [0.4.7](https://github.com/prosperitypirate/codexfi/compare/v0.4.6...v0.4.7) (2026-03-05)


### Bug Fixes

* **plugin:** remove env var fallbacks, surface disabled warning, add config-file check (v0.4.6 → v0.4.7) ([#112](https://github.com/prosperitypirate/codexfi/issues/112)) ([c26de3c](https://github.com/prosperitypirate/codexfi/commit/c26de3c2e4730bdce395a67930b13e3e1353cb19))

## [0.4.6](https://github.com/prosperitypirate/codexfi/compare/v0.4.5...v0.4.6) (2026-03-04)


### Bug Fixes

* **memory:** add project-config to extraction prompts and tighten tech-context boundary ([#107](https://github.com/prosperitypirate/codexfi/issues/107)) ([3faafb6](https://github.com/prosperitypirate/codexfi/commit/3faafb6270f9243cafc23b10d494cf0455a2df23))

## [0.4.5](https://github.com/prosperitypirate/codexfi/compare/v0.4.4...v0.4.5) (2026-03-03)


### Bug Fixes

* **plugin:** replace non-ASCII chars in generateConfigJsonc to prevent Bun bytecode corruption ([#97](https://github.com/prosperitypirate/codexfi/issues/97)) ([67e92e8](https://github.com/prosperitypirate/codexfi/commit/67e92e8a58aa2d6fc61179504febf3606dcb036a))

## [0.4.4](https://github.com/prosperitypirate/codexfi/compare/v0.4.3...v0.4.4) (2026-02-27)


### Bug Fixes

* **plugin:** use ASCII-only output to fix unicode corruption in bun global install ([16d6a4b](https://github.com/prosperitypirate/codexfi/commit/16d6a4b815b47eefd4db41722967880f17177ff2)), closes [#81](https://github.com/prosperitypirate/codexfi/issues/81)

## [0.4.3](https://github.com/prosperitypirate/codexfi/compare/v0.4.2...v0.4.3) (2026-02-27)


### Bug Fixes

* **plugin:** improve install UX — unicode rendering fix, sequential provider setup, dynamic version ([#79](https://github.com/prosperitypirate/codexfi/issues/79)) ([fbc9c88](https://github.com/prosperitypirate/codexfi/commit/fbc9c882dca1211fbbaba89293a5e42c45815d0e))

## [0.4.2](https://github.com/prosperitypirate/codexfi/compare/v0.4.1...v0.4.2) (2026-02-27)


### Bug Fixes

* **plugin:** document CONFIG_FILES write-target contract ([218d308](https://github.com/prosperitypirate/codexfi/commit/218d3080c2bc872603349c8aaaa8be2be68544dc))

## [0.4.1](https://github.com/prosperitypirate/codexfi/compare/v0.4.0...v0.4.1) (2026-02-26)


### Bug Fixes

* **plugin:** register npm package name instead of temp file path ([#61](https://github.com/prosperitypirate/codexfi/issues/61)) ([9b6619e](https://github.com/prosperitypirate/codexfi/commit/9b6619e4fde6d19fa9bb33257977bf18be9ee7a9))

## [0.4.0](https://github.com/prosperitypirate/codexfi/compare/v0.3.0...v0.4.0) (2026-02-26)


### Features

* **backend+benchmark:** temporal grounding — recency boost and date-aware retrieval ([#23](https://github.com/prosperitypirate/codexfi/issues/23)) ([b88fcd5](https://github.com/prosperitypirate/codexfi/commit/b88fcd505bd33f18e6653784d2130845ffa80c25))
* codexfi embedded plugin rewrite ([#54](https://github.com/prosperitypirate/codexfi/issues/54)) ([3d58033](https://github.com/prosperitypirate/codexfi/commit/3d58033d357427e139f6f75a52fbab3204ab5ada)), closes [#53](https://github.com/prosperitypirate/codexfi/issues/53)
* hybrid search — store source chunks alongside memories (+32.5pp) ([#19](https://github.com/prosperitypirate/codexfi/issues/19)) ([078177e](https://github.com/prosperitypirate/codexfi/commit/078177e45d6599c83782c562277a5b65b39b1015)), closes [#16](https://github.com/prosperitypirate/codexfi/issues/16)
* **memory-quality:** causal-chain extraction + architecture synthesis types — 92% → 94.5% ([#43](https://github.com/prosperitypirate/codexfi/issues/43)) ([205b6af](https://github.com/prosperitypirate/codexfi/commit/205b6af7b2c2f20962bd78568d4ad917996ae754))
* **memory-quality:** hybrid enumeration retrieval + superseded hardening — cross-synthesis 64% → 76% (+12pp) ([#36](https://github.com/prosperitypirate/codexfi/issues/36)) ([a4b8640](https://github.com/prosperitypirate/codexfi/commit/a4b8640f18b7e6e05a1bb8d6e417c9b025c8679b))
* **memory:** per-turn [MEMORY] refresh via system.transform hook ([#44](https://github.com/prosperitypirate/codexfi/issues/44)) ([dc10ef8](https://github.com/prosperitypirate/codexfi/commit/dc10ef870541c7763ea257bb0faedbc92997a1b6))
* **retrieval:** raise K to 20 + threshold to 0.45 — cross-synthesis 52% → 64% (+12pp) ([#32](https://github.com/prosperitypirate/codexfi/issues/32)) ([c749132](https://github.com/prosperitypirate/codexfi/commit/c7491322bae8db54b61a0e49853cfdafe2304c27))


### Bug Fixes

* **auto-save:** capture final assistant text via message.part.updated streaming events ([#27](https://github.com/prosperitypirate/codexfi/issues/27)) ([ee47457](https://github.com/prosperitypirate/codexfi/commit/ee474575707744edc6bf722f1f5f7557f3a21587))
* **auto-save:** fix single-turn session extraction + E2E test harness ([#26](https://github.com/prosperitypirate/codexfi/issues/26)) ([4ae9201](https://github.com/prosperitypirate/codexfi/commit/4ae92014e6ef76a285b523db6319bc4385e3203b))
* **memory-quality:** project-brief always appears + clean transcript chunks ([#24](https://github.com/prosperitypirate/codexfi/issues/24)) ([#25](https://github.com/prosperitypirate/codexfi/issues/25)) ([0cc0b6e](https://github.com/prosperitypirate/codexfi/commit/0cc0b6efac9c215b3d36ebb2d86d06a4ac237838))
* **plugin:** automated publishing setup and updated package description ([#58](https://github.com/prosperitypirate/codexfi/issues/58)) ([6bfcbce](https://github.com/prosperitypirate/codexfi/commit/6bfcbcebaeddbf963fa7cf52f1351c57a237fed3))
