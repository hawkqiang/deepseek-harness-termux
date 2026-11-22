# dsh-termux — precompiled Termux deployment (Plan B)

English | [简体中文](README.zh-CN.md)

---

Installs the patched [`@deepseek-ai/dsh`](https://github.com/deepseek-ai/deepseek-harness)
globally on Termux **without compiling anything**: the native modules
(`node-pty`, `koffi`, `node-addon-require-builtin`) ship prebuilt for the
Termux device ABI the artifact was built on (N-API — ABI stable across Node
versions), so no `clang`, `cmake`, NDK, or multi-minute builds are needed.

## Install — two variants

### Vendored (fully self-contained, ~57 MB) — recommended

```bash
npm i -g https://github.com/Vengisk/deepseek-harness-termux/releases/latest/download/dsh-termux-full.tgz
dsh web
```

Bundles the **entire patched dsh + node_modules** (natives and sharp's wasm
included) — one self-contained artifact, plain `npm i -g`, no postinstall.
Like the reference `dsh-termux` package, npm may still consult the registry on
a cold npm cache; with a warm cache (or after a previous install) it installs
from the bundle quickly.

### Layered (small, ~360 KB)

```bash
npm i -g https://github.com/Vengisk/deepseek-harness-termux/releases/latest/download/dsh-termux.tgz
dsh web
```

A postinstall fetches `@deepseek-ai/dsh` from the npm registry (with
npmjs→npmmirror fallback), applies the bundled patches, and drops in the
prebuilt natives. Small artifact; needs the registry at install time. Choose
this only when the ~57 MB download matters.

## What the postinstall does (layered variant)

1. `npm install -g --ignore-scripts @deepseek-ai/dsh@<pinned version>` (nothing compiles)
2. Applies the Android source patches bundled in `patches/`
3. Drops in the prebuilt natives (paths follow the running Node's `process.arch`):
   - `node-pty/build/Release/pty.node`
   - `koffi/build/koffi/android_<arch>/koffi.node`
   - `node-addon-require-builtin/build/napi/napi-v9-android-<arch>/require_builtin.node`
     (required by the 0.2.x launcher; upstream ships no android prebuilt for it)
   - `@deepseek-ai/node-addon-system/bin/android-<arch>/system.node`
     (POSIX flock binding for session persistence; upstream ships no android
     prebuilt — without it every session open fails with
     "flock is not supported on android-<arch>")
4. Installs `@img/sharp-wasm32` (sharp's portable WebAssembly fallback —
   required for the attachment plugin to boot)
5. Patches `dsh/lib/bin.js`'s shebang so the `dsh` bin always runs with
   `--expose-internals` (required by the HMR plugin)

Everything is idempotent — re-running the install re-applies patches and
natives (npm re-extracts `dsh` first).

## Requirements

- Termux on the device ABI this artifact was built for (the artifact is built
  by `scripts/build-prebuilt.sh` on that same device; paths are arch-derived,
  never hardcoded)
- Node.js `>= 24.9.0` (the same requirement as `@deepseek-ai/dsh` 0.2.x)
- `patch` (`pkg install patch`) — used by the layered variant to apply the
  source patches

## Rebuilding the prebuilt packages (for maintainers)

Run on an arm64 Termux device:

```bash
# 1. get a working patched install (compiles the natives once)
bash install.sh
# 2. package the tarballs (both modes by default)
DSH_DIR="$(npm root -g)/@deepseek-ai/dsh" bash scripts/build-prebuilt.sh
#    MODES=layered | MODES=full to build only one
# 3. upload dsh-termux.tgz and dsh-termux-full.tgz to a GitHub release, then
#    users can install from the releases/latest/download URLs above
```

The natives are N-API so they keep working across `dsh` updates; only bump the
pinned `DSH_VERSION` in `install.js` (and re-validate the patches) when
`install.sh`'s patches are updated for a new dsh release.

## Notes

- The `dsh` bin (installed by `@deepseek-ai/dsh` itself, or by the vendored
  package) runs with `--expose-internals` automatically via the patched
  shebang.
- Mobile UI / search plugins are **not** installed by either variant; add them
  with `dsh plugin --profile web add ...` after first boot.
