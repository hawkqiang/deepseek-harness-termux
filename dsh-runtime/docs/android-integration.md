# 与 Android 客户端对接（Termux RUN_COMMAND）

本文说明原生 Android 客户端 [hawkqiang/dsh-android-client](https://github.com/hawkqiang/dsh-android-client) 如何通过 Termux 的 `RUN_COMMAND` 机制管理本目录这套后端，以及排错要点。

## 为什么用 RUN_COMMAND 而不是后台服务

Android 不允许普通应用随意拉起 Termux 里的进程。Termux 提供了受控通道：应用发送一个显式 `Intent` 给 `com.termux.app.RunCommandService`，由 Termux 在它自己的进程里执行命令，并通过 `PendingIntent` 回传结果。

- 客户端**不需要**常驻前台服务、不需要轮询、不需要 `MANAGE_EXTERNAL_STORAGE`。
- 命令执行完即结束；客户端只在用户点击时发一次 Intent。

## 一次性准备

1. **Termux 允许外部应用执行命令** —— `~/.termux/termux.properties`：

   ```properties
   allow-external-apps = true
   ```

   改完执行 `termux-reload-settings`（或强制停止 Termux 再打开）。

2. **授予权限** —— 客户端首次调用时弹出系统对话框，授予 `com.termux.permission.RUN_COMMAND`。拒绝后可在系统「应用 → Termux 权限」里手动打开。

3. **控制脚本就位** —— 构建 Android 客户端时会自动安装到 `~/.local/bin/dsh-termux-ctl`（也可手动）：

   ```bash
   install -m 0755 scripts/dsh-termux-ctl.sh ~/.local/bin/dsh-termux-ctl
   ```

## Intent 规格

| 项 | 值 |
| --- | --- |
| action | `com.termux.RUN_COMMAND` |
| 目标组件 | `com.termux/.app.RunCommandService` |
| 权限 | `com.termux.permission.RUN_COMMAND` |
| `com.termux.RUN_COMMAND_PATH` | 控制脚本绝对路径，默认 `~/.local/bin/dsh-termux-ctl` |
| `com.termux.RUN_COMMAND_ARGUMENTS` | `String[]`，如 `status --host 127.0.0.1 --port 3080` |
| `com.termux.RUN_COMMAND_WORKDIR` | 工作目录（脚本内部会切到 DSH 工作目录） |
| `com.termux.RUN_COMMAND_BACKGROUND` | `true` |
| `com.termux.RUN_COMMAND_COMMAND_LABEL` | 通知栏标签，如 `DSH status` |
| `com.termux.RUN_COMMAND_PENDING_INTENT` | 结果回调 `PendingIntent`（`FLAG_MUTABLE`） |

结果通过 `Bundle`（key `result`）回传：

| key | 含义 |
| --- | --- |
| `stdout` / `stderr` | 标准输出 / 错误输出 |
| `exitCode` | 退出码 |
| `err` / `errmsg` | Termux 插件层错误码与信息（非 0 表示 Intent 层面失败） |

## 控制脚本动作

```bash
~/.local/bin/dsh-termux-ctl status                 # 状态 / PID / 端口 / 日志路径 / AUTH_URL
~/.local/bin/dsh-termux-ctl start                  # 后台启动 dsh web（setsid，脱离 Termux 会话）
~/.local/bin/dsh-termux-ctl stop                   # 先 TERM，超时后 KILL
~/.local/bin/dsh-termux-ctl restart                # stop + start
~/.local/bin/dsh-termux-ctl logs --lines 150       # 最近日志
~/.local/bin/dsh-termux-ctl url                    # 取带 ?token= 的认证链接
```

通用参数：`--host`、`--port`、`--workdir`、`--lines`。

输出为 `KEY=VALUE` 行，便于客户端解析：

```
STATUS=RUNNING
PID=12381
HOST=127.0.0.1
PORT=3080
URL=http://127.0.0.1:3080
PORT_OPEN=yes
UPTIME=06:55:50
LOG=/data/data/com.termux/files/home/.dsh/dsh-web.log
AUTH=required
AUTH_URL=http://127.0.0.1:3080/?token=xxxxxxxx
```

要点：

- **按端口精确匹配实例**：脚本读取 `/proc/<pid>/cmdline` 里的 `--port`，只管理目标端口上的 `dsh web`，不会误杀别的实例；端口不一致时输出 `OTHER_PORTS=3080` 提示。
- **`AUTH_URL` 会校验**：从日志里取到的历史 token 会先用 `curl` 试一次，只有服务端仍接受（303）才返回，避免把过期 token 交给客户端。
- **无常驻、无轮询**：`status` 是一次性探测（`curl` + `/dev/tcp`），不启动任何后台循环。

## 客户端的认证流程

DSH 的 Web 监听器只接受带**本进程启动令牌**的首次访问：

```
GET /                      → 401  dsh web authentication required
GET /?token=<launch>       → 303  Set-Cookie（30 天，HttpOnly, SameSite=Lax）
GET /  (带 Cookie)         → 200  页面
```

客户端行为：

1. 无 Cookie 时调用 `dsh-termux-ctl url` 取令牌链接（非交互、单次）。
2. 加载该链接完成交换，Cookie 由系统 WebView 持久化。
3. 之后直接访问 `http://127.0.0.1:<port>`。
4. 若返回 401（例如后端重启换了令牌），由 `onReceivedHttpError` 自动重取，最多 3 次，避免死循环。
5. 未授予 Termux 权限时，可用菜单「粘贴认证链接」手动打开 `dsh web` 打印的链接。

> 后端重启会换令牌，但签名密钥（`~/.dsh` 下的凭据）不变，因此旧 Cookie 在有效期内仍然有效。

## 排错

| 现象 | 原因 / 处理 |
| --- | --- |
| 提示需要 Termux 权限 | 系统权限里授予 `com.termux.permission.RUN_COMMAND` |
| 提示 `allow-external-apps` | `~/.termux/termux.properties` 设为 `true` 后 `termux-reload-settings` |
| 状态显示 `STOPPED` 但 `OTHER_PORTS` 有值 | 后端跑在别的端口；在客户端「连接与脚本配置」里改成该端口 |
| 一直 401 | 用「粘贴认证链接」手动贴 `dsh web` 输出的链接；或 `dsh-termux-ctl url` 看是否取到 `AUTH_URL` |
| 点击无反应 | Android 12+ 后台启动限制：先打开一次 Termux，或在系统电池设置里允许 Termux 后台运行 |