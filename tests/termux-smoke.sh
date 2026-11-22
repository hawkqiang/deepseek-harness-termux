#!/data/data/com.termux/files/usr/bin/bash
# Run in Termux after installation, without credentials.
set -eu
[[ $(node -p 'process.platform') == android ]]
[[ $(dsh --version) == 0.2.2-rc.5 ]]
dsh --help >/dev/null
dsh --profile web --dump-config-schema | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))'
probe=$(mktemp)
trap 'rm -f "$probe"' EXIT
node --input-type=module - "$(npm root -g)/@deepseek-ai/dsh/node_modules/@deepseek-ai/node-addon-system/lib/flock.js" "$probe" <<'JS'
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {tryLockExclusive} = await import(process.argv[2]);
const a = fs.openSync(process.argv[3], 'r+'), b = fs.openSync(process.argv[3], 'r+');
await tryLockExclusive(a);
await assert.rejects(tryLockExclusive(b), {code: 'EAGAIN'});
fs.closeSync(a);
await tryLockExclusive(b);
fs.closeSync(b);
JS
printf 'Termux smoke passed (%s)\n' "$(node -p 'process.arch')"
