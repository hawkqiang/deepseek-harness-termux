# 0.2.2-rc.5 分支与命令基线

本文件是 0.2.2-rc.5 适配工作的起点记录：分支位置、上游发布物出处、与 0.1.x
的差异、以及要在 Termux 内逐项验证的安装/CLI/交互命令清单。

## 1. 分支与基线提交

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/Vengisk/deepseek-harness-termux` |
| 本地路径 | `C:\Users\chen7\project\project2\deepseek-harness-termux` |
| 新分支 | `termux-022-rc5` |
| 基线提交 | `4e56ebf3440e1eaa4ac61c611bcab085b089776e`（main，2026-08-26，`fix(dsh-tool-fs-search): resolve ripgrep via require.resolve + system-rg fallback on Termux`） |
| 可用 ref | 仅 `main` 与标签 `v0.1.0-termux.1`；仓库没有 0.2.x 分支，也没有 `0.1.5` 标签 |

克隆说明：本机 git 走 schannel 会报 `SEC_E_NO_CREDENTIALS`，已在该仓库的本地配置里
设置 `http.sslBackend=openssl`（未改全局配置），之后 `git clone` / `ls-remote` 正常。

## 2. 上游 rc5 发布物

- npm 包：`@deepseek-ai/dsh@0.2.2-rc.5`，`dist-tags` 中 `latest` 与 `next` 同时指向它。
- tarball：`https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.2-rc.5.tgz`（2,201,324 字节）
  - sha512：`cNbp12tLYLUTXaVli7zwwMjzmmEVCD1PRldg4oKtXM4+lFYckcaliMS2PU/FoThB4iAN/fKOSID0nrtRZU4Gjw==`
  - sha1：`b540ae0577939a34c43fdc6bf44f034b2de040e5`
  - 下载后本地重算的 sha512/sha1 与 registry 元数据逐字节一致。
- 源码仓：`deepseek-ai/deepseek-harness` 标签 `dsh-v0.2.2-rc.5` → 提交 `9c2670d3bce5275e0d1610272958121af87787bb`，
  prerelease，发布于 2026-11-18，**无二进制附件**（npm 包即发布物）。
- `engines.node = ">=24.9.0"`（0.1.x 未声明此限制），Termux 侧的 Node 版本要按此选型。

## 3. 与 0.1.5 的对照

仓库 `prebuilt/install.js` 钉的是 `0.1.0-rc.6`；npm 上没有 `0.1.5` 正式版，最近的
0.1.x 为 `0.1.5-rc.3`，因此对照基准取 `0.1.5-rc.3`，并注明仓库实际钉的是 `0.1.0-rc.6`。

| 项 | 0.1.5-rc.3 | 0.2.2-rc.5 |
|---|---|---|
| 包描述 | `dsh CLI: profile boot, plugin management, and the browser UI alias` | 增加 profile 层叠（patch layers）语义 |
| `web` 入口 | 硬编码子命令 `dsh web`（alias 实现） | `dsh <name>` 泛化为 `dsh --profile <name>`，`dsh web` 仍等价 |
| dump 选项 | `--dump-config`、`--dump-default-config` | 两者保留，新增 `--dump-config-schema` |
| 内置 profile 模板 | web / headless / … | `web`、`headless`、`sdk`、`sdk-minimal`、`acp` 首次使用自动初始化；`desktop` 由 Electron 独占，CLI 拒绝 |
| `tui` | README 示例用 `dsh --profile tui` | 同上，但 tui **不是**内置模板，需用 `--from-default-profile` 自建 |
| 交互命令包 | `dsh-command-compact`、`dsh-command-goal` | 相同 |

## 4. 安装入口（待测三条路径）

1. `bash install.sh` —— 源码编译路线：Termux 依赖、NDK/clang、`--ignore-scripts` 安装、
   打 `patches/`、手动编 `node-pty` / `koffi`。
2. `npm i -g <release>/dsh-termux-full.tgz` —— vendored 自包含（约 57 MB），装后直接 `dsh web`。
3. `npm i -g <release>/dsh-termux.tgz` —— layered（约 360 KB），postinstall 拉
   `@deepseek-ai/dsh@DSH_VERSION`、打补丁、放预编译 native、装 `@img/sharp-wasm32`、
   改写 shebang 加 `--expose-internals`。

三条路径最终都要求 Termux 内可直接执行 `dsh`，且 `dsh web` 能起服务。

## 5. CLI 待测清单（必须在 Termux 应用内执行，不以宿主结果代替）

- `dsh --version` / `dsh -V`
- `dsh --help`（launcher 自身帮助，profile 内帮助另测）
- `dsh web`（起 web，确认监听地址/端口）
- `dsh web --port <port>`（避开已占用端口）
- `dsh --profile web --dump-config`、`--dump-default-config`、`--dump-config-schema`
- `dsh plugin --profile web <add|remove|why> ...`（转发 pnpm）
- `dsh headless "..."`（一次性任务、退出码）
- `dsh tui` / `dsh --profile tui`（模板缺失时记录报错原文）
- `dsh plugin --profile web add dsh-web-mobile`、`dsh-web-search-pro`（可选，记录插件兼容性）
- `node --expose-internals $(npm root -g)/@deepseek-ai/dsh/lib/bin.js web`（README 的启动等价写法）

## 6. 交互命令待测清单

- `/help`（并记录该版本实际暴露的完整命令表）
- `/compact`
- `/goal`
- 会话内工具相关的代表性交互：文件读写工具、`bash`/`pwsh` 工具、`fs-search`（ripgrep）、
  `web` 工具、`subagent`、`todo`、`plan`（按 rc5 `docs/tool-catalog.md` 存在性逐项记录）

## 7. 已知适配风险（第 4 步核实结果）

- **04 补丁（host-apiproxy）**：已删除。`dsh-host-apiproxy` 在 rc5 依赖树中不存在（npm 上也
  无 `0.2.2-rc.5` 版本）。rc5 的打开文件/浏览器职责由 `dsh-web-app` 内置 opener 承担：它 spawn
  一个子进程 import npm `open` 包，`open@11` 对 `platform === "android"` 已走系统 `xdg-open`，
  失败时 web-app 捕获并降级为打印 URL（不致命）。`install.sh` 现会在 Termux 上创建
  `xdg-open -> termux-open` shim（termux-open 存在且 xdg-open 缺失时），让浏览器实际拉起。
- **koffi-statx 补丁**：保留并按树内实际版本重做。rc5 依赖树解析的是 `koffi@3.1.1`
  （npm 包内 `docs/dependency-catalog.json` 是 0.1.5-rc.2 的陈旧快照，不可作为版本依据；
  设备上 `node_modules/koffi` 实测 3.1.1）。3.1.1 的 `lib/native/base/base.cc` 在 StatAt 中
  仍直接使用 glibc 的 `statx()`（无 STATX_TYPE/CORE_NO_STATX 条件），在 Termux bionic 下
  编译报 `cannot initialize a member subobject of type '__u32' ... statx` —— 新补丁把该处
  守卫改为 `#if defined(__linux__) && !defined(__ANDROID__)`（走 fstatat 分支）。
- **node-addon-require-builtin（rc5 新增启动硬依赖）**：rc5 launcher 启动时通过
  `node-addon-native-custom-loader` 加载该 N-API 绑定；上游只发布 darwin/linux/win32 的
  可选包（`android-x64`/`android-arm64` 都不存在），npm 包内也不含源码（"fails closed"）。
  不补齐则任何 Termux 设备 `dsh web` 均在 boot 阶段崩溃
  （`No usable native binding found for node-addon-require-builtin-android-<arch>`）。
  install.sh 第 5c 步从上游源码仓
  `deepseek-ai/dsh-node-addon-require-builtin`（master @ `a58d3599`，release 0.1.9，
  N-API 9 ABI 稳定）用 node-gyp 编译（`-Dnarb_product=require-builtin`，依赖
  node-addon-api 头文件），产物放到加载器的本地构建路径
  `build/napi/napi-v9-android-<arch>/require_builtin.node`；layered 产物经
  build-prebuilt.sh 打包、prebuilt/install.js 落位。
- **08 补丁（ripgrep）**：重做并改名 `08-dsh-util-ripgrep-android-rg.patch`。rc5 的
  `dsh-tool-fs-search` 不再自带 resolveRgPath，改为 import `@deepseek-ai/dsh-util-ripgrep`；
  新补丁针对 `dsh-util-ripgrep/lib/index.js`：先 `require.resolve('@vscode/ripgrep-<p>-<a>/bin/rg')`，
  再退回 `import('@vscode/ripgrep')`（保留 Electron asar 处理），最后退回系统 rg
  （`RIPGREP_BIN` / Termux / usr 路径）。`@vscode/ripgrep@1.18.0` 在模块加载时即 require
  android 平台包（不存在），shim（install.sh / prebuilt/install.js 创建，按运行 Node 的
  `process.arch` 命名）仍是第一道解析路径。
- **其余补丁**：01/02/03/05/06/07 全部按 `0.2.2-rc.5` 实际源码重新生成（03 的目标从
  `dsh-subprocess-local/lib/index.js` 移到打包 chunk `lib/runner-launch-CKTiL8M8.js`；
  06 的 `WorkspaceUnknownSessionError` 增加了第二参数；02 的 fs/promises import 列表变化；
  05/01 上下文行变化）。全部通过 `git apply --check -p1` 对 rc5 源码验证。
- **Node 版本**：rc5 `engines.node = ">=24.9.0"`。Termux `nodejs`（current）= `26.13.1`、
  `nodejs-lts` = `24.22.3`，均满足。旧 bootstrap 升级到新 nodejs 会因 libc++ 版本错配报
  `CANNOT LINK EXECUTABLE "node": cannot locate symbol _ZNSt6__ndk113__hash_memoryEPKvm`，
  必须整体 `pkg upgrade`（或 `pm clear` 重置）；install.sh 增加 Node >= 24.9.0 前置检查与
  修复提示，并在 apt 层写入 `Dpkg::Options --force-confdef/--force-confold` 防止旧系统升级
  被 openssl.cnf conffile 交互提示卡死。
- **native ABI**：koffi 加载三元组 = `android_${process.arch}`（arm64 -> android_arm64，
  x64 -> android_x64，cnoke 构建目录实测一致），node-pty 预编译目录 = `android-${process.arch}`，
  node-addon-require-builtin 本地构建路径 = `napi-v9-android-<arch>`。install.sh 的
  koffi 构建后会把产物归位到加载器三元组目录；install.sh / prebuilt/install.js /
  scripts/build-prebuilt.sh 全部按运行时 arch 推导，不写死任何设备 ABI。
- **预编译 native 复用**：`prebuilt/` 目录本身为空（.gitignore 管理）；layered 产物由
  build-prebuilt.sh 在已装好的设备上生成，包含 pty.node、koffi.node、require_builtin.node
  和 node-addon-system 的 system.node（flock 绑定，见 §9.5）。

## 8. 下一步输入

第 2、3 步需要：可启动的 Android 模拟器（API/ABI）+ Termux 内 `PREFIX`、Node 版本、架构。
这些事实拿到后，第 4 步再决定 pin `DSH_VERSION=0.2.2-rc.5`、补丁取舍与 native 重建方式。

## 9. 第 4 步验证结果（Android 模拟器内 Termux，x86_64，node v26.13.1）

测试环境：Windows 模拟器 API 34（x86_64，Google APIs 镜像），Termux 0.118.3 x86_64 APK，
镜像 mirrors.tuna.tsinghua.edu.cn/termux-main。所有结果均来自 Termux 应用内执行，无宿主替代。

### 9.1 两条安装路径

| 路径 | 场景 | 结果 |
|---|---|---|
| `bash install.sh`（源码编译路线） | **从旧版升级**：先装 0.1.0-rc.6（旧仓 `4e56ebf` 源码，sed 钉版本），再跑新版 install.sh | ✅ rc=0。npm 安装 rc5、7 个补丁全部应用、koffi 3.1.1 编译（android_x64）、node-pty 编译、require_builtin 从源码编译、`dsh --version`=0.2.2-rc.5、`dsh web --port` 起服务正常 |
| `npm i -g dsh-termux.tgz`（layered） | 在升级完成的安装上重装 | ✅ rc=0。postinstall 重装 dsh@0.2.2-rc.5、重打补丁、落位 pty.node / koffi.node / require_builtin.node（android-x64）、补 rg shim、改写 shebang，`dsh --version`=0.2.2-rc.5 |
| `bash install.sh` | **干净安装**（pm clear 后全新 bootstrap） | 见 9.3 |

### 9.2 启动版本与启动状态（升级后）

- `dsh --version` / `node --expose-internals lib/bin.js --version` → `0.2.2-rc.5`
- `dsh` 直接可用（shebang 已带 `--expose-internals`，`/data/data/com.termux/files/usr/bin/dsh`）
- `dsh web --port 19139` 打印 `http://127.0.0.1:19139/?token=…` 并保持服务运行（timeout 25s 内正常）
- rg 解析链路：`resolveRgPath()` → shim `@vscode/ripgrep-android-x64/bin/rg` → 系统 `/usr/bin/rg`（15.2.0）
- 全部 7 个补丁 reverse-check APPLIED（01/02/03/05/06/07/08）
- native 三件套加载验证：koffi（`require('koffi').protocol` OK）、node-pty、require_builtin

### 9.3 干净安装（Phase C）

`pm clear com.termux` 后全新 bootstrap（Termux 0.118.3 自带快照）→ 配置镜像 →
`pkg upgrade` + 工具链（node v26.13.1）→ 直接运行新版 `install.sh`：

- ✅ rc=0。npm 安装 `@deepseek-ai/dsh@0.2.2-rc.5`、7 个补丁全部应用、
  koffi 3.1.1 编译（android_x64）、node-pty 编译、require_builtin 编译落位。
- ✅ `dsh --version` = `0.2.2-rc.5`（`dsh` 命令直接可用，shebang 带 `--expose-internals`）
- ✅ `dsh web --port 19139` 打印 `http://127.0.0.1:19139/?token=…` 并持续服务；
  模拟器无浏览器时浏览器拉起按 rc5 设计优雅降级
  （"could not open the default browser ... use the dsh web URL printed at startup"）。
- ⚠️ 安装期间两处 github.com 克隆在模拟器网络下无限挂起（require_builtin 源码克隆、
  dsh-web-mobile 插件克隆）：require_builtin 的源码改由宿主经 codeload 拉取后推入设备编译
  （与 install.sh 内联构建等价，产物一致）；插件为可选 WARN 路径。install.sh 已加
  `timeout 180/300` 防挂起。

### 9.4 未解问题 / 遗留

- **模拟器 x86_64 ≠ 真机 arm64**：本次原生编译产物是 android-x64；prebuilt 仓库此前针对
  android-arm64。真机 arm64 上的编译/加载（koffi 3.1.1、require_builtin、node-pty）仍待验证，
  脚本已按运行时 arch 推导，理论通用。
- **koffi-statx 补丁绑定 koffi 源码行号**：koffi 升级（如 3.2.1 的 `defined(STATX_TYPE)`
  变体）需重新生成补丁；建议上游在 bionic 上修正 statx 守卫。
- **require_builtin 钉的是 master@a58d3599（0.1.9）**：npm 上 binding 已到 0.1.10，
  若上游再发 android 预编译包，可去掉源码编译步骤。另实测该 addon 的 `requireBuiltin()`
  不接受 `node:` 前缀 id（`node:os` 报 "target internal module load failed"，裸 `os` 正常），
  dsh web 启动不受影响（boot 成功），属上游行为，记录备查。
- **模拟器内 github.com 克隆不稳定**（两次实验中 3/4 次 `git-remote-https` 无限挂起，
  npm registry 正常）：install.sh 的 require_builtin 克隆与插件安装已加 timeout；
  受影响时 require_builtin 可用 `codeload.github.com` tarball 替代（宿主拉取 → 推入设备
  → `packages/native` 下 node-gyp 构建，与脚本内联构建等价）。dsh-web-mobile 插件
  为可选 WARN，重跑 install.sh 或手动安装即可。
- **npm 包内 `docs/dependency-catalog.json` 是 0.1.5-rc.2 陈旧快照**，不能作为 rc5 依赖树
  版本依据（本次 koffi 版本误判的根因），后续适配以实装树为准。
- **Node 26 上旧版（0.1.0-rc.6）`dsh web` 崩溃**（`user patch-layer watching requires the
  Cordis HMR service`），旧版安装仅 CLI 可用；升级到 rc5 后 web 正常，属旧版自身问题。
- **模拟器内 npm 直连 registry.npmjs.org 偶发 120s+ 的慢请求**；install.sh 已带
  npmmirror 回退与输出看门狗，未拦截本次安装。
- **dsh-host-apiproxy 打开文件能力**：rc5 无对应包；`open@11` 在 android 走 `xdg-open`，
  install.sh 建 `xdg-open -> termux-open` shim。实测模拟器无浏览器应用时按 rc5 设计
  优雅降级为打印 URL（见 9.3）。

### 9.5 第 5 步逐项回归（模拟器 Termux 实测，x86_64，node v26.13.1）

测试方式：非交互项经 `adb shell run-as com.termux`（Termux 应用内 UID 10192）执行；
`dsh web` 启动用后台进程 + HTTP 轮询；带 token 的页面/cookie 链路在模拟器内用 curl 完成。
所有结果来自 Termux 应用内，无宿主替代。复现脚本保存在工作区 `.android-test\`
（step5-r1/r2/plug/webvar/idem 等，按脚本头部注释逐项对应下表）。

| # | 命令 | 测试条件 | 预期 | 实际结果 |
|---|---|---|---|---|
| 1 | `dsh --version` / `dsh -V` | Termux 应用内 shell | `0.2.2-rc.5`，rc=0 | ✅ 两者均 `0.2.2-rc.5`，rc=0 |
| 2 | `dsh --help` | 同上 | launcher 帮助 | ✅ rc=0，`--profile`/`--from-default-profile`/`--patch`/三种 dump 全部在列 |
| 3 | `dsh web`（默认端口） | 模拟器内后台启动 | 打印 URL 并监听 | ✅ `http://127.0.0.1:3080/?token=…`；根路径无 token 返回 401（鉴权按设计） |
| 4 | `dsh web --port <p>` | 同上，p=19152/19153/19157 | 同上 | ✅ 打印 URL、`/api/remote.mux` 无 token 401；模拟器上首次启动约 50–90 s（环境性能，非缺陷） |
| 5 | `dsh --profile web --dump-config` / `--dump-default-config` / `--dump-config-schema` | 只读、不 boot | 三种 dump 正常 | ✅ 三者 rc=0，schema 为合法 JSON（draft 2020-12） |
| 6 | `dsh plugin --profile web add / why / remove` | 本地 tarball `dsh-test-plugin-0.0.1.tgz`（模拟器内构建，避开 github 不稳） | pnpm 转发成功 | ✅ add rc=0（`+ dsh-test-plugin 0.0.1`，带"no dsh.bundle → plain dependency"WARN，符合设计）；why rc=0（依赖树）；remove rc=0。pnpm 12.21.0 |
| 7 | `dsh headless "…"` | 无 `DEEPSEEK_API_KEY` | 明确报错、rc≠0 | ✅（flock 修复后）`MISSING_CREDENTIAL: llm-deepseek: no API key … store DEEPSEEK_API_KEY through the credentials service … or export DEEPSEEK_API_KEY`，rc=1 → **缺凭据项** |
| 8 | `dsh tui` / `dsh --profile tui` | tui 非内置模板 | 明确报错 | ✅ rc=1，原文 `dsh: profile "tui" does not exist; create it with 'dsh plugin --profile tui add <package>'` |
| 9 | `node --expose-internals $(npm root -g)/@deepseek-ai/dsh/lib/bin.js web --port <p>` | 等价启动写法 | 与 `dsh web` 一致 | ✅ 打印 URL，无 token 401 |
| 10 | `/help` `/compact` `/goal`（交互） | 需浏览器会话；`/compact` 还需 LLM 凭据 | UI 内执行 | ⛔ **未执行**：模拟器无浏览器、无凭据。已验证的部分：命令定义随包安装（`dsh-command-compact` 源码含 `Usage: /compact`、`dsh-command-goal` 在位）；服务端 HTML 引用 `dsh-client-ui-commands`/`-goal`/`-plan`/`-subagent` 模块；token→303→Set-Cookie→200 鉴权链路模拟器内实测通过 |
| 11 | 会话工具底座（fs-search 的 rg、bash 工具的 node-pty、会话锁） | 非 LLM 依赖部分 | 可用 | ✅ `resolveRgPath()` → 系统 rg 15.2.0（08 补丁链路）；node-pty spawn bash rc=0；flock 租约获取/争用 EAGAIN/释放后重锁三测全过（09 补丁 + 新原生绑定，见下） |
| 12 | subagent / todo / plan / web 工具等 agent 循环功能 | 需 LLM 凭据 + 会话 | — | ⛔ **未测（缺凭据）**；服务已随 profile 就位（`--dump-config` 含 agent/user-questions/jobs/session-title 等） |

**发现并修复：任何会话打开（`dsh headless`、web 首个会话）报
`dsh: flock is not supported on android-x64`（rc=1）**

- 根因：rc5 会话持久化（`dsh-session-persistence-jsonl`）经
  `@deepseek-ai/node-addon-system@0.1.2` 的 `lib/flock.js` 取 flock 租约；上游只发布
  darwin/linux(glibc|musl) 预编译，platform 守卫直接抛 `ERR_FLOCK_UNSUPPORTED_PLATFORM`。
  第 4 步只验过 `dsh web` 起服务（flock 在首个会话打开时才触发），故此前未暴露。
- 修复（最小改动）：① 新增 `patches/09-node-addon-system-android-flock.patch`：平台守卫
  放行 android，并从包内 `bin/android-<arch>/system.node` 加载（bionic 有 flock(2)）；
  ② 新增 `native/node-addon-system-flock/`（纯 C、N-API，`tryLock(fd, cb)` →
  `flock(fd, LOCK_EX|LOCK_NB)`，回调带 errno）；③ `install.sh`：第 4 步应用 09 补丁、
  新增 5e 步编译落位、第 8 步校验；④ `prebuilt/install.js`/`scripts/build-prebuilt.sh`/
  `prebuilt/README*.md` 同步（native 四件套；产物版本 `0.2.2-rc.5-termux.2`）。
- 复测：flock 三项单元测试全过；`dsh headless` 从 flock 崩溃变为到达凭据检查；
  `bash install.sh` 全量重跑 rc=0 且 09 补丁与 5e 构建两环节均正确 SKIP（幂等）。
- 复现步骤（设备上）：`bash install.sh && dsh headless "reply pong"`（无凭据时停在
  MISSING_CREDENTIAL，不再出现 flock 报错；配好 key 后即为完整 headless 验证）。

**ARM64 真机项**：本次所有编译产物为 android-x64；真机 arm64 需在设备上重跑
`bash install.sh`（koffi/pty/require_builtin/flock 绑定均按运行时 `process.arch`
落位，脚本不写死 ABI），再按 §9.5 表逐项复测；交互命令项还需真机浏览器（Chrome）
与有效 `DEEPSEEK_API_KEY`。