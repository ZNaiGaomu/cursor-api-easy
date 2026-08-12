# cursor-api-easy

把 Cursor 账号里的模型，变成本地 OpenAI 兼容接口。  
登录你自己的 Cursor 后，就能在任意支持自定义 OpenAI 接口的客户端里使用。

## 功能

- 浏览器 OAuth 登录自己的 Cursor 账号
- 本地 `OpenAI Chat Completions` 兼容接口
- 自动拉取账号可用模型列表
- 支持流式输出与工具调用
- 多把可管理 API Key，统一 URL
- 浏览器管理页：创建 / 停用 / 删除 Key，可选额度
- Windows / macOS / Linux
- 可选本地代理出口（需自行配置）

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

**Release 预构建包：** 解压后进入目录，无需再 build。

### 3. 登录自己的 Cursor

```bash
bun run dist/cli.js login
```

浏览器会打开 Cursor 授权页。同意后，凭证只保存在本机：

```text
~/.config/cursor-openai-api/credentials.json
```

仓库和 Release **不包含任何账号或 token**。

### 4. 启动

Windows：双击 `start.bat`，或：

```bat
bun run dist/cli.js serve
```

macOS / Linux：

```bash
chmod +x start.sh
./start.sh
```

默认地址：

```text
管理页:    http://localhost:3000/admin
Base URL:  http://localhost:3000/v1
API Key:   在管理页生成后发给使用者，不再接受任意字符串
```

第一次启动若未设置 `ADMIN_PASSWORD`，程序会生成管理员密码并打印在终端。  
打开管理页，用该密码登录，再创建 Key。完整 Key 只显示一次。

客户端（ChatBox、LobeChat、Codex++、OpenAI SDK 等）填：

```text
Base URL: https://你的子域名/v1   （本机测试用 http://localhost:3000/v1）
API Key:  你发放的 sk-...
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

- 每把 Key 可单独启用 / 停用 / 删除
- 额度可选：不填 = 不限额；填写次数后用尽即拒绝
- 可设置过期时间
- Cursor 登录凭证只留在你这台电脑，不会随 Key 发出去

建议启动前设置管理员密码：

```bat
set ADMIN_PASSWORD=你自己的管理密码
start.bat
```

## 环境设置（可选代理）

默认 **直连** Cursor，不强制走任何本地端口。

如果你所在网络访问部分模型会报地区不可用（例如 `not supported in your region`），需要自己准备一条可用的代理线路，并把地址写进环境变量。  
**端口、协议以你本机代理软件为准**，不要照抄别人的端口。

先在代理软件里确认：

- 协议：HTTP 或 SOCKS5
- 本机监听地址和端口（例如 `127.0.0.1:xxxx`）

再在启动本程序前设置：

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

服务继续跑在这台 Windows 上。域名解析到本机用 Cloudflare Tunnel，不用开路由器端口。

1. 域名放到 Cloudflare
2. 安装 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
3. 登录：`cloudflared tunnel login`
4. 创建隧道并绑子域名，例如 `api.你的域名` → `http://127.0.0.1:3000`

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
bun run dist/cli.js models    # 列出账号可用模型
bun run dist/cli.js serve     # 启动服务，默认端口 3000
```

端口也可用 `PORT=8080`。

接口：

- `GET  /v1/models`
- `POST /v1/chat/completions`

## 常见限制

这些来自 Cursor 账号 / 地区政策，不是本程序漏模型：

- **地区限制**：部分供应商在部分地区不可用。自行配置 `HTTPS_PROXY` 换出口后再试。
- **Fable 5**：首次使用需在 Cursor 客户端 Settings → Models 确认数据保留政策。
- **额度**：以你的 Cursor 套餐为准。

## 开发

```bash
bun install
bun run src/cli.ts serve
bun run build
```

## 许可

MIT，见 `LICENSE`。
