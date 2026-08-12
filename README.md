# cursor-api-easy

把 Cursor 账号里的模型，变成 OpenAI 兼容接口。  
登录你自己的 Cursor 后，在管理页发放 Key，别人用统一 URL + 你给的 Key 即可调用。

当前版本：**v0.2.0**

## 功能

- 浏览器 OAuth 登录自己的 Cursor 账号
- `OpenAI Chat Completions` 兼容接口
- 自动拉取账号可用模型列表
- 支持流式输出与工具调用
- 浏览器管理页：创建 / 停用 / 删除 / 复制 Key
- 多把 Key，统一 URL；没有对应 Key 无法调用
- 额度可选：不填 = 不限额；填次数后用尽即拒绝
- 可设置过期时间
- Windows / macOS / Linux
- 可选本地代理出口（需自行配置）
- 可用 Cloudflare Tunnel 把本机服务挂到自己的子域名

## 使用方法

### 1. 环境

- [Bun](https://bun.sh)（推荐）或 Node.js 18+
- 一个可用的 Cursor 账号
- Windows / macOS / Linux

### 2. 安装

**源码：**

```bash
git clone https://github.com/ZNaiGaomu/cursor-api-easy.git
cd cursor-api-easy
bun install
bun run build
```

**Release 预构建包：** 下载 `cursor-api-easy-v0.2.0.zip`，解压后进入目录，无需再 build。

### 3. 登录自己的 Cursor

```bash
bun run dist/cli.js login
```

浏览器会打开 Cursor 授权页。同意后，凭证只保存在本机：

```text
~/.config/cursor-openai-api/credentials.json
```

仓库和 Release **不包含任何账号、管理员密码或 token**。

### 4. 启动

Windows：双击 `start.bat`，或：

```bat
set ADMIN_PASSWORD=你自己的管理密码
start.bat
```

macOS / Linux：

```bash
export ADMIN_PASSWORD=你自己的管理密码
chmod +x start.sh
./start.sh
```

未设置 `ADMIN_PASSWORD` 时，首次启动会生成管理员密码并打印在终端。

### 5. 管理页发放 Key

打开：

```text
http://localhost:3000/admin
```

用管理员密码登录后：

1. 填写名称，可选填额度、过期时间
2. 点「生成 Key」
3. 在列表里点「复制 Key」发给使用者

本机和公网是同一套服务、**同一把 Key**。  
本地 `http://localhost:3000/v1` 也必须带这把 Key，不能再随便填。

旧版（v0.1）之前生成、未保存明文的 Key，列表里会显示「无法复制」，需要删除后重新生成。

### 6. 客户端怎么填

```text
本机:
  Base URL:  http://localhost:3000/v1
  API Key:   管理页生成的 sk-...

公网（配好域名后）:
  Base URL:  https://你的子域名/v1
  API Key:   同一把 sk-...
```

API 格式请选 **OpenAI Chat Completions**，不要选 Responses API / Anthropic。

```javascript
import OpenAI from "openai"

const client = new OpenAI({
  apiKey: "sk-你发给对方的key",
  baseURL: "http://localhost:3000/v1",
})
```

## Key 与额度

- 每把 Key 可单独启用 / 停用 / 删除 / 复制
- 额度可选：不填 = 不限额；填写次数后用尽返回 429
- 可设置过期时间
- Cursor 登录凭证只留在你这台电脑，不会随 Key 发出去
- 停用或删除后立即失效

## 环境设置（可选代理）

默认 **直连** Cursor，不强制走任何本地端口。

如果部分模型报地区不可用（例如 `not supported in your region`），需要自己准备代理，并把地址写进环境变量。  
**端口、协议以你本机代理软件为准。**

**Windows cmd：**

```bat
set HTTPS_PROXY=http://127.0.0.1:你的端口
set HTTP_PROXY=http://127.0.0.1:你的端口
start.bat
```

**PowerShell：**

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:你的端口"
$env:HTTP_PROXY="http://127.0.0.1:你的端口"
.\start.bat
```

**bash：**

```bash
export HTTPS_PROXY=http://127.0.0.1:你的端口
export HTTP_PROXY=http://127.0.0.1:你的端口
./start.sh
```

SOCKS5 示例：`socks5h://127.0.0.1:你的端口`。  
未设置 `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` 时一律直连。

## 用域名给别人用（本机 + Cloudflare）

服务继续跑在你的电脑上。用 Cloudflare Tunnel 把子域名指到本机，不用开路由器端口。

1. 域名放到 Cloudflare
2. 安装 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
3. `cloudflared tunnel login`，在网页里点选你的域名
4. 创建隧道，把 `api.你的域名` 指到 `http://127.0.0.1:3000`
5. 电脑上同时保持：API 服务 + cloudflared 隧道

别人只填：

```text
Base URL: https://api.你的域名/v1
API Key:  你在管理页生成的 Key
```

## 命令

```bash
bun run dist/cli.js login     # 浏览器登录 Cursor
bun run dist/cli.js logout    # 清除本机凭证
bun run dist/cli.js whoami    # 查看登录状态
bun run dist/cli.js models    # 列出账号可用模型（同样需要先 login）
bun run dist/cli.js serve     # 启动服务，默认端口 3000
```

端口也可用 `PORT=8080`。

接口：

- `GET  /admin`  管理页
- `GET  /v1/models`
- `POST /v1/chat/completions`

## 常见限制

这些来自 Cursor 账号 / 地区政策，不是本程序漏模型：

- **地区限制**：部分供应商在部分地区不可用。自行配置 `HTTPS_PROXY` 换出口后再试。
- **Fable 5**：首次使用需在 Cursor 客户端 Settings → Models 确认数据保留政策。
- **额度**：以你的 Cursor 套餐为准。Key 次数额度是本程序额外加的访问控制。

## 开发

```bash
bun install
bun run src/cli.ts serve
bun run build
```

## 许可

MIT，见 `LICENSE`。
