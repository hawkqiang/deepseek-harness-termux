#!/usr/bin/env node
// dsh-termux postinstall (Plan B — precompiled native modules).
//
// Installs the patched @deepseek-ai/dsh globally WITHOUT compiling anything:
//   1. npm install -g --ignore-scripts @deepseek-ai/dsh@<pinned>
//   2. apply the Android source patches (bundled in patches/)
//   3. drop in the prebuilt native modules (bundled in prebuilt/)
//      - node-pty  -> node-pty/build/Release/pty.node
//      - koffi     -> koffi/build/koffi/android_<arch>/koffi.node
//      - require-builtin -> node-addon-require-builtin/build/napi/napi-v9-android-<arch>/require_builtin.node
//      - node-addon-system flock -> @deepseek-ai/node-addon-system/bin/android-<arch>/system.node
//
// Everything is idempotent: re-running `npm i -g <tarball>` re-applies the
// patches and re-drops the natives (npm re-extracts dsh first, which wipes
// the previous copies).

"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Bump together with patches/: only a dsh version whose sources the patches
// apply to cleanly is safe to pin here. Overridable via DSH_VERSION.
const DSH_VERSION = process.env.DSH_VERSION || "0.2.2-rc.5";
const PKG_DIR = __dirname;

function sh(cmd, opts) {
  try {
    return execSync(cmd, { stdio: "pipe", ...opts }).toString().trim();
  } catch {
    return "";
  }
}

// ── Pre-flight checks ───────────────────────────────────────────────────────
// Fail fast with a clear message instead of a confusing mid-install error.
// dsh 0.2.x declares engines.node >= 24.9.0.
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 24 || (nodeMajor === 24 && nodeMinor < 9)) {
  console.error(`[ERROR] dsh 0.2.x needs Node.js >= 24.9.0 (found ${process.version}).`);
  console.error("        On Termux:  pkg update -y && pkg upgrade -y && pkg install -y nodejs");
  process.exit(1);
}
// koffi's loader triplet (android_${process.arch}) and node-pty's prebuild
// dir (android-${process.arch}) follow the RUNNING Node arch; no device ABI
// is hardcoded. The artifact must actually contain natives for this arch —
// checked below, after resolving KARCH.
const KARCH = process.arch;
if (process.platform !== "android") {
  console.warn("  [WARN] this package targets Termux/Android; continuing anyway");
}
console.log(`  [OK] ${process.platform}-${process.arch}, node ${process.version}`);

// ── Locate the npm global root ──────────────────────────────────────────────
let globalRoot = sh("npm root -g");
if (!globalRoot) {
  globalRoot = path.join(
    process.env.PREFIX || "/data/data/com.termux/files/usr",
    "lib",
    "node_modules",
  );
}
const dshDir = path.join(globalRoot, "@deepseek-ai", "dsh");
const dshPkgs = path.join(dshDir, "node_modules", "@deepseek-ai");

// ── Step 1: install dsh (download only, nothing compiles) ──────────────────
// Try the user's configured registry first (respects .npmrc / mirrors the
// user already set up), then fall back to the official registry and finally
// npmmirror (China) — same multi-source strategy as install.sh.
console.log(`==> [1/5] Installing @deepseek-ai/dsh@${DSH_VERSION} (no scripts — nothing compiles)`);
function installDsh(registry) {
  const flag = registry ? ` --registry="${registry}"` : "";
  execSync(`npm install -g --ignore-scripts @deepseek-ai/dsh@${DSH_VERSION}${flag}`, {
    stdio: "inherit",
    timeout: 600000,
  });
}
const REGISTRY_FALLBACKS = [null, "https://registry.npmjs.org", "https://registry.npmmirror.com"];
let dshInstalled = false;
for (const registry of REGISTRY_FALLBACKS) {
  try {
    installDsh(registry);
    dshInstalled = true;
    break;
  } catch {
    console.log(`  [WARN] registry ${registry ?? "(user default)"} failed — trying next`);
  }
}
if (!dshInstalled) {
  console.error("  [ERROR] could not install @deepseek-ai/dsh from any registry");
  process.exit(1);
}

// ── Step 2: apply the Android source patches ───────────────────────────────
console.log("==> [2/3] Applying Android platform patches");
const PATCH_TARGETS = [
  ["01-terminal-bash-android-shell.patch", "dsh-terminal-bash"],
  ["02-session-persistence-link-rename.patch", "dsh-session-persistence-jsonl"],
  ["03-subprocess-local-android.patch", "dsh-subprocess-local"],
  ["05-host-directory-picker-native-android.patch", "dsh-host-directory-picker-native"],
  ["06-workspace-archive-skip-session-known-check.patch", "dsh-workspace"],
  ["07-sandbox-local-proot-runner.patch", "dsh-sandbox-local"],
  ["08-dsh-util-ripgrep-android-rg.patch", "dsh-util-ripgrep"],
  ["09-node-addon-system-android-flock.patch", "node-addon-system"],
];
for (const [file, pkg] of PATCH_TARGETS) {
  const patch = path.join(PKG_DIR, "patches", file);
  const dir = pkg ? path.join(dshPkgs, pkg) : path.join(dshDir, "node_modules", "koffi");
  if (!fs.existsSync(patch)) {
    console.log("  [WARN] patch file missing:", file);
    continue;
  }
  if (!fs.existsSync(dir)) {
    console.log("  [SKIP]", file, "(package dir not found)");
    continue;
  }
  if (sh(`patch -p1 --dry-run --forward < "${patch}"`, { cwd: dir })) {
    sh(`patch -p1 --forward < "${patch}"`, { cwd: dir });
    console.log("  [OK]", file);
  } else {
    console.log("  [SKIP]", file, "(already applied or inapplicable)");
  }
}

// ── Step 2b: ripgrep platform-package shim ──────────────────────────────────
// @vscode/ripgrep requires @vscode/ripgrep-<platform>-<arch> AT MODULE LOAD,
// and no android platform package exists. With the patched resolveRgPath
// (08-*.patch) a system rg alone would suffice, but the shim keeps every
// @vscode/ripgrep consumer working. Idempotent; arch follows the RUNNING Node.
const rgSystem = process.env.RG_SYSTEM || "/data/data/com.termux/files/usr/bin/rg";
if (fs.existsSync(rgSystem)) {
  const rgShim = path.join(dshDir, "node_modules", "@vscode", `ripgrep-android-${process.arch}`);
  if (!fs.existsSync(path.join(rgShim, "package.json"))) {
    fs.mkdirSync(path.join(rgShim, "bin"), { recursive: true });
    fs.writeFileSync(path.join(rgShim, "package.json"), JSON.stringify({
      name: `@vscode/ripgrep-android-${process.arch}`,
      version: "1.18.0",
      description: `Termux shim: resolves rgPath to the system ripgrep (${rgSystem}); @vscode/ripgrep has no android platform package.`,
      license: "MIT",
      bin: { rg: "bin/rg" },
    }, null, 2) + "\n");
    fs.symlinkSync(rgSystem, path.join(rgShim, "bin", "rg"));
    console.log(`  [OK] ripgrep android-${process.arch} shim -> ${rgSystem}`);
  } else {
    console.log("  [SKIP] ripgrep shim already present");
  }
} else {
  console.log("  [WARN] system rg not found — glob/grep tools need it (pkg install ripgrep)");
}

// ── Step 3: drop in the prebuilt native modules ─────────────────────────────
console.log(`==> [3/3] Installing prebuilt native modules (android-${KARCH})`);
const prebuiltDir = path.join(PKG_DIR, "prebuilt", `android-${KARCH}`);
const TARGETS = [
  ["pty.node", path.join(dshDir, "node_modules", "node-pty", "build", "Release", "pty.node")],
  ["koffi.node", path.join(dshDir, "node_modules", "koffi", "build", "koffi", `android_${process.arch}`, "koffi.node")],
  ["require_builtin.node", path.join(dshDir, "node_modules", "node-addon-require-builtin", "build", "napi", `napi-v9-android-${process.arch}`, "require_builtin.node")],
  ["system.node", path.join(dshDir, "node_modules", "@deepseek-ai", "node-addon-system", "bin", `android-${process.arch}`, "system.node")],
];
for (const [file, dest] of TARGETS) {
  const src = path.join(prebuiltDir, file);
  if (!fs.existsSync(src)) {
    console.log("  [WARN] prebuilt module missing:", file, `(no prebuilt/android-${KARCH} in this artifact)`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  console.log("  [OK]", file, "->", path.relative(globalRoot, dest));
}

// ── Step 3b: verify the natives actually load ───────────────────────────────
// Catches an ABI/Node-version mismatch at install time with a clear message
// instead of a confusing crash at first `dsh web`.
console.log("==> [3b/5] Verifying native modules load...");
const verify = sh(`node -e "require('${dshDir}/node_modules/node-pty'); require('${dshDir}/node_modules/koffi'); console.log('ok')"`);
if (verify.includes("ok")) {
  console.log("  [OK] node-pty + koffi load");
} else {
  console.error("  [ERROR] the prebuilt native modules failed to load on this Node.");
  console.error("          Node version:", process.version, "| platform:", process.platform, process.arch);
  console.error(`          This artifact ships android-${KARCH} N-API binaries (Node >= 24.9.0).`);
  process.exit(1);
}

// ── Step 4: sharp WebAssembly fallback ──────────────────────────────────────
// sharp's native (libvips) binary is not available for android-arm64; dsh's
// attachment plugin fails to boot without it. The portable wasm build fixes it.
console.log("==> [4/5] Installing sharp WebAssembly fallback...");
let sharpOk = false;
for (const registry of REGISTRY_FALLBACKS) {
  try {
    const flag = registry ? ` --registry="${registry}"` : "";
    execSync(`npm install @img/sharp-wasm32${flag}`, { cwd: dshDir, stdio: "pipe", timeout: 300000 });
    sharpOk = true;
    break;
  } catch {
    // try next registry
  }
}
if (sharpOk) {
  console.log("  [OK] @img/sharp-wasm32 installed");
} else {
  console.log("  [WARN] could not install @img/sharp-wasm32 (sharp may fail to load)");
}

// ── Step 5: make the `dsh` bin run with --expose-internals ─────────────────
// The nested `npm install -g @deepseek-ai/dsh` links <prefix>/bin/dsh ->
// @deepseek-ai/dsh/lib/bin.js. That file's shebang is a bare `node`, but the
// HMR plugin needs --expose-internals, so we bake the flag into the shebang.
// When the symlink is exec'd the kernel reads the target's shebang and passes
// the flag — this is robust against npm re-linking bin entries. (We do NOT
// declare bin.dsh in our own package.json: that would collide with
// @deepseek-ai/dsh's bin during the nested install, EEXIST.)
console.log("==> [5/5] Ensuring the dsh bin runs with --expose-internals");
const binJs = path.join(dshDir, "lib", "bin.js");
const shebang = `#!${process.execPath} --expose-internals`;
const content = fs.readFileSync(binJs, "utf8");
if (!content.startsWith("#!")) {
  console.log("  [WARN] bin.js has no shebang — leaving as-is");
} else if (content.startsWith(shebang)) {
  console.log("  [OK] bin.js shebang already has --expose-internals");
} else {
  fs.writeFileSync(binJs, shebang + "\n" + content.slice(content.indexOf("\n") + 1));
  fs.chmodSync(binJs, 0o755); // writeFileSync preserves mode; be explicit anyway
  console.log("  [OK] bin.js shebang ->", shebang);
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log("");
console.log("==> dsh-termux installed!");
console.log("");
console.log("Run:  dsh web");
console.log("");
console.log("Optional extras after first boot:");
console.log("  dsh plugin --profile web add github:mexiaosqwq/dsh-web-mobile   # mobile UI");
