# cursor-api-easy

把 Cursor 账号里的模型，变成本地 OpenAI 兼容接口。  
登录你自己的 Cursor 后，就能在任意支持自定义 OpenAI 接口的客户端里用。

基于 [egoist/cursor-openai-api](https://github.com/egoist/cursor-openai-api)（MIT）改进，增加 Windows 支持、完整模型发现、会话 blob 修复，以及可选的本地代理出口。

## 别人怎么用

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
Base URL:  http://localhost:3000/v1
API Key:   任意非空字符串，例如 cursor
```

客户端（ChatBox、LobeChat、Codex++、OpenAI SDK 等）填上面两项即可。  
API 格式请选 **OpenAI Chat Completions**，不要选 Responses API / Anthropic。

```javascript
import OpenAI from "openai"

const client = new OpenAI({
  apiKey: "cursor",
  baseURL: "http://localhost:3000/v1",
})
```

## 可选：网络代理

默认 **直连** Cursor。  
若 Claude / GPT / Gemini 报 `not supported in your region`，说明当前出口 IP 被 Cursor 按地区限制，需要走非受限线路。

启动前设置环境变量（示例端口按你自己的代理软件改）：

**Windows cmd：**

```bat
set HTTPS_PROXY=http://127.0.0.1:7890
set HTTP_PROXY=http://127.0.0.1:7890
start.bat
```

**PowerShell：**

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:7890"
$env:HTTP_PROXY="http://127.0.0.1:7890"
.\start.bat
```

**bash：**

```bash
export HTTPS_PROXY=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
./start.sh
```

也支持 `socks5h://127.0.0.1:7890`。  
未设置时不会强制走任何本地端口。

## 命令

```bash
bun run dist/cli.js login     # 浏览器登录 Cursor
bun run dist/cli.js logout    # 清除本机凭证
bun run dist/cli.js whoami    # 查看登录状态
bun run dist/cli.js models    # 列出账号可用模型
bun run dist/cli.js serve     # 启动代理，默认端口 3000
```

端口也可用 `PORT=8080`。

接口：

- `GET  /v1/models`
- `POST /v1/chat/completions`

## 常见限制

这些来自 Cursor 账号 / 地区政策，不是本程序漏模型：

- **地区限制**：部分供应商（Anthropic / OpenAI / Google）在部分地区不可用。设 `HTTPS_PROXY` 换出口后再试。
- **Fable 5**：首次使用需在 Cursor 客户端 Settings → Models 确认数据保留政策。
- **额度**：以你的 Cursor 套餐为准。

## 开发

```bash
bun install
bun run src/cli.ts serve
bun run build
```

## 许可

MIT。原作者 Copyright (c) 2026 EGOIST，见 `LICENSE`。  
本仓库在其基础上修改并重新发布。
