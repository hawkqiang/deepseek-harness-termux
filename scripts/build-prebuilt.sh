#!/usr/bin/env bash
# build-prebuilt.sh — assemble the dsh-termux prebuilt tarballs (Plan B).
#
# Run on an arm64 Termux device that already has a WORKING patched install
# (run install.sh once). Produces two tarballs:
#   dsh-termux.tgz        (layered,  ~360 KB) — small; postinstall pulls dsh
#                          from the npm registry (with npmjs→npmmirror fallback)
#   dsh-termux-full.tgz   (vendored, ~55 MB)  — fully offline; bundles the
#                          entire patched dsh + node_modules incl. natives
#
# Users install either with:
#   npm i -g https://github.com/Vengisk/deepseek-harness-termux/releases/latest/download/dsh-termux.tgz
#   npm i -g https://github.com/Vengisk/deepseek-harness-termux/releases/latest/download/dsh-termux-full.tgz
#
# Usage:
#   bash scripts/build-prebuilt.sh                 # uses the global install
#   DSH_DIR=/path/to/dsh bash scripts/build-prebuilt.sh
#   MODES=layered bash scripts/build-prebuilt.sh   # only the layered tarball
#   MODES=full   bash scripts/build-prebuilt.sh    # only the vendored tarball
#
# The natives are N-API (ABI stable), so the tarballs keep working across dsh
# updates; rebuild only when the patches or native deps change.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$REPO_DIR/prebuilt"
MODES="${MODES:-layered full}"

# ── 1. Locate a working patched install ─────────────────────────────────────
if [ -z "${DSH_DIR:-}" ]; then
    DSH_DIR="$(npm root -g)/@deepseek-ai/dsh"
fi
if [ ! -f "$DSH_DIR/package.json" ]; then
    echo "[ERROR] no @deepseek-ai/dsh found at $DSH_DIR"
    echo "        Run install.sh first, or set DSH_DIR=/path/to/dsh"
    exit 1
fi
echo "==> Using patched install at: $DSH_DIR"

# Native module paths follow the RUNNING Node arch (koffi loader triplet
# android_<arch>, node-pty prebuilds dir android-<arch>) — no hardcoded ABI.
KARCH="$(node -p process.arch)"
PTY="$DSH_DIR/node_modules/node-pty/build/Release/pty.node"
KOFFI="$DSH_DIR/node_modules/koffi/build/koffi/android_$KARCH/koffi.node"
# rc5's launcher needs this binding; it is built by install.sh (5c) from the
# upstream source (upstream publishes no android prebuilt package).
NARB="$DSH_DIR/node_modules/node-addon-require-builtin/build/napi/napi-v9-android-$KARCH/require_builtin.node"
# flock binding for @deepseek-ai/node-addon-system (session persistence locks;
# no android prebuilt upstream — built by install.sh 5e, consumed via
# patches/09-node-addon-system-android-flock.patch)
NAS_FLOCK="$DSH_DIR/node_modules/@deepseek-ai/node-addon-system/bin/android-$KARCH/system.node"
for f in "$PTY" "$KOFFI"; do
    if [ ! -f "$f" ]; then
        echo "[ERROR] missing $f — run install.sh first"
        exit 1
    fi
done
if [ ! -f "$NARB" ]; then
    echo "[WARN] missing $NARB — the rc5 launcher will fail at boot without it"
fi
if [ ! -f "$NAS_FLOCK" ]; then
    echo "[WARN] missing $NAS_FLOCK — session opens (headless/web) will fail with 'flock is not supported'"
fi
echo "    pty.node : $PTY"
echo "    koffi    : $KOFFI"

# ── 2. Sanity-check the natives load in this node ───────────────────────────
echo "==> Verifying natives load..."
if ! (cd "$DSH_DIR" && node -e "require('node-pty'); require('koffi'); console.log('    natives OK')"); then
    echo "[ERROR] natives failed to load — rebuild them first (bash install.sh)"
    exit 1
fi

# ── 3a. Layered tarball (small; dsh fetched from the registry at install) ───
build_layered() {
    echo "==> Building layered tarball (dsh-termux.tgz)..."
    STAGE="$(mktemp -d)"
    mkdir -p "$STAGE/package/bin" \
             "$STAGE/package/patches" \
             "$STAGE/package/prebuilt/android-$KARCH"

    cp "$PKG_DIR/package.json" "$STAGE/package/"
    cp "$PKG_DIR/install.js"    "$STAGE/package/"
    cp "$PKG_DIR/README.md"     "$STAGE/package/"
    cp "$PKG_DIR/README.zh-CN.md" "$STAGE/package/"
    cp "$PKG_DIR/bin/dsh"       "$STAGE/package/bin/dsh"
    chmod +x "$STAGE/package/bin/dsh"
    cp "$REPO_DIR"/patches/*.patch "$STAGE/package/patches/"
    cp "$PTY"  "$STAGE/package/prebuilt/android-$KARCH/pty.node"
    cp "$KOFFI" "$STAGE/package/prebuilt/android-$KARCH/koffi.node"
    if [ -f "$NARB" ]; then
        cp "$NARB" "$STAGE/package/prebuilt/android-$KARCH/require_builtin.node"
        echo "    -> require_builtin.node staged (android-$KARCH)"
    fi
    if [ -f "$NAS_FLOCK" ]; then
        cp "$NAS_FLOCK" "$STAGE/package/prebuilt/android-$KARCH/system.node"
        echo "    -> node-addon-system system.node staged (android-$KARCH)"
    fi

    OUT="$REPO_DIR/dsh-termux.tgz"
    tar -czf "$OUT" -C "$STAGE" package
    rm -rf "$STAGE"
    echo "    -> $OUT ($(du -h "$OUT" | cut -f1))"
}

# ── 3b. Vendored tarball (full offline; whole patched dsh + node_modules) ───
build_full() {
    echo "==> Building vendored tarball (dsh-termux-full.tgz)..."
    STAGE="$(mktemp -d)"
    FULL_PKG="$STAGE/package"
    mkdir -p "$FULL_PKG"

    # the whole patched install (lib, config, node_modules incl. natives)
    cp -a "$DSH_DIR/." "$FULL_PKG/"

    # node-pty's install script (prebuild.js) exits 0 only when
    # prebuilds/<platform>-<arch>/ exists — otherwise npm falls back to
    # node-gyp rebuild and tries to COMPILE. Mirror the binary there so a
    # plain `npm i -g` (no --ignore-scripts) never compiles.
    if [ -f "$DSH_DIR/node_modules/node-pty/build/Release/pty.node" ]; then
        mkdir -p "$FULL_PKG/node_modules/node-pty/prebuilds/android-$KARCH"
        cp "$DSH_DIR/node_modules/node-pty/build/Release/pty.node" \
           "$FULL_PKG/node_modules/node-pty/prebuilds/android-$KARCH/pty.node"
        chmod 755 "$FULL_PKG/node_modules/node-pty/prebuilds/android-$KARCH/pty.node"
        echo "    -> node-pty prebuild mirrored (prebuilds/android-$KARCH/pty.node)"
    fi

    # sharp's wasm fallback must live INSIDE the vendored tree (the layered
    # install drops it at the global root; here it must travel with the package)
    if [ ! -d "$FULL_PKG/node_modules/@img/sharp-wasm32" ]; then
        # install.sh puts it inside the dsh tree; the layered prebuilt puts it
        # at the global root — prefer a local copy before falling back to npm
        if [ -d "$DSH_DIR/node_modules/@img/sharp-wasm32" ]; then
            mkdir -p "$FULL_PKG/node_modules/@img"
            cp -a "$DSH_DIR/node_modules/@img/sharp-wasm32" "$FULL_PKG/node_modules/@img/"
        elif [ -d "$(dirname "$DSH_DIR")/@img/sharp-wasm32" ]; then
            mkdir -p "$FULL_PKG/node_modules/@img"
            cp -a "$(dirname "$DSH_DIR")/@img/sharp-wasm32" "$FULL_PKG/node_modules/@img/"
        else
            echo "    -> fetching @img/sharp-wasm32 into the vendored tree..."
            (cd "$FULL_PKG" && env -u npm_config_prefix -u npm_config_global \
                npm install @img/sharp-wasm32 --no-save --ignore-scripts > /dev/null 2>&1 || true)
        fi
    fi

    # verify the vendored tree is self-sufficient
    if ! (cd "$FULL_PKG" && node -e "require('sharp'); require('node-pty'); require('koffi'); console.log('    vendored natives OK')"); then
        echo "[ERROR] vendored tree fails to load — aborting full build"
        return 1
    fi

    # rename + version suffix + bin + bundledDependencies (npm keeps the
    # bundled node_modules without re-fetching — same as the reference package)
    node -e "
        const fs = require('fs');
        const p = '$FULL_PKG/package.json';
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        j.name = 'dsh-termux';
        j.version = j.version + '-termux.1';
        j.bin = { dsh: 'lib/bin.js', 'dsh-termux': 'lib/bin.js' };
        j.bundleDependencies = Object.keys(j.dependencies || {});
        j.description = (j.description || '') + ' (vendored Termux build)';
        fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    "

    # ensure bin.js runs with --expose-internals (HMR)
    BIN_JS="$FULL_PKG/lib/bin.js"
    if [ -f "$BIN_JS" ] && ! head -1 "$BIN_JS" | grep -q -- "--expose-internals"; then
        NODE_BIN="$(command -v node)"
        { printf '#!%s --expose-internals\n' "$NODE_BIN"; tail -n +2 "$BIN_JS"; } > "$BIN_JS.new"
        mv "$BIN_JS.new" "$BIN_JS"
        chmod +x "$BIN_JS"   # the .new rewrite drops +x under umask — restore it
        echo "    -> bin.js shebang patched (--expose-internals)"
    fi

    OUT="$REPO_DIR/dsh-termux-full.tgz"
    tar -czf "$OUT" -C "$STAGE" package
    rm -rf "$STAGE"
    echo "    -> $OUT ($(du -h "$OUT" | cut -f1))"
}

for mode in $MODES; do
    case "$mode" in
        layered) build_layered ;;
        full)    build_full ;;
        *) echo "[WARN] unknown mode: $mode (layered|full)" ;;
    esac
done

echo ""
echo "==> Done. Upload both to a GitHub release, then users install:"
echo "    npm i -g https://github.com/Vengisk/deepseek-harness-termux/releases/latest/download/dsh-termux.tgz"
echo "    npm i -g https://github.com/Vengisk/deepseek-harness-termux/releases/latest/download/dsh-termux-full.tgz"
