# dsh-runtime — 本机实测可用的 DSH Termux 后端（v1.3.0）

这是作者在 **Android 16 / Termux arm64** 上**实际正在运行**的 DeepSeek Harness 后端载荷，作为本仓库根目录那套（Vengisk 系）安装器的**并行方案**收录。两套互不覆盖、互不影响，可按需选用。

- 纯文本载荷约 **170 KB**：安装器、设备端更新器、10 个 npm 补丁、`dsh` 包装器、Android 控制脚本、文档。
- **不含**任何二进制或用户数据：没有 `node/`（glibc Node，201 MB）、没有 `work/node_modules`（1.3 GB）、没有 `~/.dsh` 下的凭据 / 会话 / 日志 / 启动令牌。

## 来源与许可

| 内容 | 来源 |
| --- | --- |
| `install.sh`、`scripts/common.sh`、`scripts/patch-lib.sh`、`scripts/update-dsh.sh`、`patches/*.patch`、`work/dsh`、`work/dsh-termux-open`、`VERSION` | [ErEbusE/dsh-termux](https://github.com/ErEbusE/dsh-termux) v1.3.0（MIT），原样收录 |
| `scripts/dsh-termux-ctl.sh` | 本仓库新增：供 Android 客户端通过 Termux `RUN_COMMAND` 管理后端 |
| `docs/android-integration.md` | 本仓库新增 |

上游脚本内容未作任何修改；本目录只做收录、补充控制脚本与文档。

## 目录

```
dsh-runtime/
├── README.md                    # 本文件
├── VERSION                      # 运行时载荷版本（1.3.0）
├── install.sh                   # 设备端安装器：解包 tarball、配置 glibc Node、生成 dsh 包装器
├── scripts/
│   ├── common.sh                # 共享助手（glibc Node 配置、包装器生成、原生预编译校验）
│   ├── patch-lib.sh             # 补丁应用库（可在 Linux CI 与 Termux 上共用）
│   ├── update-dsh.sh            # 设备端更新器：切 npm 版本 + 重放补丁集
│   └── dsh-termux-ctl.sh        # Android 客户端后端控制（start/stop/restart/status/logs/url）
├── patches/                     # 10 个 npm 包补丁（Android/Termux 适配）
├── work/
│   ├── dsh                      # glibc Node 包装器（设置 $BROWSER 交接）
│   └── dsh-termux-open          # $BROWSER 打开器（URL 与本地文件分流）
└── docs/
    └── android-integration.md   # 与 dsh-android-client 的对接细节
```

## 安装

### 方式 A — 官方 release tarball（含二进制，推荐）

tarball 里已包含 `node/` 与打好补丁的 `work/`，装完即可用：

```bash
curl -fsSL https://github.com/ErEbusE/dsh-termux/releases/latest/download/install.sh | bash -s -- -y
```

### 方式 B — 用本目录的文件自行打包

本目录只有文本载荷。若要离线安装，需自备 `node/`（glibc Node arm64）与 `work/`（`npm install @deepseek-ai/dsh` 后重放 `patches/`），再与本目录合并打包：

```bash
tar -czf dsh-termux-runtime.tar.gz \
  node work install.sh scripts patches VERSION
```

然后：

```bash
bash install.sh -p dsh-termux-runtime.tar.gz -y
```

安装器会：清空旧运行时 → 解包 → 用 `configure_glibc_node` 把 Node 的 ELF 解释器指向 Termux 的 glibc loader → 用 `write_dsh_wrapper` 生成 `dsh` 与 `dsh-termux-open` → 软链到 `~/.local/bin/dsh` → 在 `~/.bashrc` 里加 PATH（标记 `# dsh-termux`）。

### 方式 C — 已经装过

```bash
dsh update -y            # 升到最新 npm 版本并重放补丁
dsh update --self        # 只刷新更新器与补丁集（不下载 npm 包）
```

## 日常运维

```bash
dsh web                  # 启动 Web UI（默认 127.0.0.1:3080，会打印带 ?token= 的链接）
dsh web --port 3081      # 换端口
dsh update -y            # 升级 dsh 并重放补丁
dsh --profile web        # 同 dsh web
```

后端**不会**被本目录的任何脚本自动拉起或杀掉；`update-dsh.sh` 明确不管理运行中的实例，启停由你自己（或 Android 客户端的 `dsh-termux-ctl.sh`）负责。

## 补丁清单

| 补丁 | 作用 |
| --- | --- |
| `npm-dsh-fs-local-link-rename.patch` | `writeFileAtomic` 在 `link()` 失败时回退到 rename |
| `npm-dsh-attachment-local-link-rename.patch` | 附件落盘同上（图片提交路径） |
| `npm-dsh-attachment-local-link-rename-015.patch` | 不可变别名发布同上 |
| `npm-dsh-attachment-local-durable-walk.patch` | 目录 fsync 持久化遍历 |
| `npm-dsh-session-persistence-jsonl-link-rename.patch` | 会话 JSONL 原子发布同上 |
| `npm-dsh-session-persistence-jsonl-link-rename-015.patch` | 同上（另一处发布点） |
| `npm-dsh-session-persistence-jsonl-worker-link-rename-015.patch` | 同上（worker 线程内） |
| `npm-dsh-sandbox-local-landlock-tmpdir.patch` | Landlock 沙箱可写 tmpdir |
| `npm-dsh-client-connection-samesite-lax.patch` | 浏览器会话 Cookie 用 `SameSite=Lax`（WebView / localhost 必需） |
| `npm-dsh-experimental-auto-review-transport-retry.patch` | 自动评审传输层错误重试 |

> Android 的 `/storage/emulated/0`（sdcardfs / FUSE）与 Termux 内部路径不支持 `link(2)` 硬链接，这是前 7 个补丁存在的根本原因。

## 与 Android 客户端联动

`scripts/dsh-termux-ctl.sh` 让原生 Android 客户端（[hawkqiang/dsh-android-client](https://github.com/hawkqiang/dsh-android-client)）通过 Termux `RUN_COMMAND` 管理后端，无需常驻服务或轮询。细节见 [docs/android-integration.md](docs/android-integration.md)。

## 排错

| 现象 | 处理 |
| --- | --- |
| 浏览器打开 `127.0.0.1:3080` 显示 `dsh web authentication required` | 必须带上 `dsh web` 打印的 `?token=...` 首次访问；之后 30 天内靠 Cookie |
| 端口被占用 | `dsh web --port <其它端口>`；Android 客户端在「连接与脚本配置」里同步端口 |
| `dsh: command not found` | `~/.local/bin` 不在 PATH；`source ~/.bashrc` 或重跑 `install.sh` |
| 更新后补丁没生效 | `dsh update --self --force` 强制重放补丁集 |