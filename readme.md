## Spike: MCP-UI (MCP Apps) for Agent UI

本仓库用于快速验证与理解 **MCP-UI / MCP Apps** 在“Agent UI”场景下的使用方式，并给出与我们现有架构（Vercel AI SDK + Lambda Agent + tools）的选型观点。

参考：

- MCP-UI 官网：[`https://mcpui.dev/`](https://mcpui.dev/)
- MCP-UI 仓库：[`https://github.com/MCP-UI-Org/mcp-ui`](https://github.com/MCP-UI-Org/mcp-ui)

---

## 1. 背景与目标

我们的目标是为 agent 提供**可交互 UI**，让 “对话 → 工具调用 → 结果展示 → 用户交互 → 再次工具调用” 的闭环更高效、更可控，并且在内部系统的工程约束下做到：

- 可维护（类型安全、可测试、可演进）
- 可控（权限、鉴权、审计、灰度）
- 可扩展（跨团队复用、插件化交付）
- 安全（不完全信任的 UI 代码也能被隔离渲染）

---

## 2. 核心观点（选型结论）

- **主推荐：Host‑Native（React/Next 自研 UI + 现有 tool calling）**

  - 内部项目通常优先选择“最少新协议、最强可控”的路径：agent/tool 输出结构化数据，host 用组件渲染，交互事件直接回调到现有 tools。

- **备选增强：MCP‑UI / MCP Apps（协议化 UI + sandboxed iframe）**

  - 当我们需要**插件化交付 UI**（跨团队、外部 URL、低信任 UI 代码）或希望标准化 “UI action → tool call” 时，MCP‑UI 是很好的方案。
  - MCP‑UI 明确强调：远端 UI 代码在 **sandboxed iframes** 中执行，降低 host 与用户风险。见：[`mcpui.dev`](https://mcpui.dev/)

- **第三选择：CopilotKit（偏“应用内 Copilot”范式）**
  - 适合做“应用内副驾驶”的交互体验，但需要评估它的范式与我们现有对话/工具体系是否重叠，避免引入额外抽象层导致迁移成本上升。

---

## 3. 为什么 MCP-UI 要用 iframe 隔离？

核心是 **安全隔离 + 治理边界**：

- **安全边界**：UI 代码在 sandboxed iframe 中执行，默认无法直接访问 host 的 DOM、全局状态与敏感上下文；即使 UI 被注入恶意脚本，也尽可能被限制在 iframe 内。官方描述见：[`mcpui.dev`](https://mcpui.dev/)
- **治理边界**：UI 不“直接执行”工具调用，而是通过 `postMessage` 发送 **UI actions**，host 在 `onUIAction` 中作为仲裁者决定是否执行、如何鉴权、是否二次确认。

实践建议（生产环境）：

- 严格限制 `postMessage` 的 `targetOrigin` 与来源校验（不要使用 `'*'`）
- 对 action 进行 schema 校验与 tool 白名单过滤
- 将“权限检查/审计记录/限流”放在 host 或后端网关层

---

## 4. 方案对比（含评分）

评分口径（满分 10）：面向内部项目常见优先级做主观评分  
**维护/可控 30% + 集成成本 25% + 安全 20% + 扩展复用 15% + 调试体验 10%**

| 方案                               | 与现有 Lambda tools 的适配                       | 核心优点                                                               | 主要代价/风险                                                      | 评分（10 分） |
| ---------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------: |
| Host‑Native（React/Next 自研组件） | 最高：直接复用现有 tools                         | 最可控、最易维护、类型安全强、调试最顺、权限/鉴权/审计都在体系内       | 需要自建“UI action schema/组件规范/交互标准”；跨团队复用靠工程治理 |           9.0 |
| MCP‑UI / MCP Apps                  | 中高：UI action 映射到现有 tools（不必全迁 MCP） | 插件化交付、sandbox 隔离、安全边界清晰、action 协议统一、host 集成简单 | 多一层 iframe/消息协议/版本治理；不同宿主支持差异需评估            |           7.8 |
| CopilotKit                         | 中等：能接 tools，但受其交互范式影响             | 快速实现“应用内 Copilot”体验，适合与产品状态深度联动                   | 框架范式绑定、潜在迁移成本；需实测与现有对话/工具模型的耦合        |           7.2 |

> 注：当“插件化 UI / 低信任 UI / 跨团队交付”的权重提升时，MCP‑UI 的综合得分会显著上升，可能超过 Host‑Native。

---

## 5. 本仓库的 Spike 工程结构

我们用 4 个 workspace 把职责拆开，便于理解 MCP-UI 的边界与数据流：

- `apps/host`：浏览器端 **Host / Renderer**（React + Vite）

  - 用 `@mcp-ui/client` 的 `UIResourceRenderer` 渲染 resource（iframe/remote-dom）
  - 在 `onUIAction` 中接收 UI actions，并将其映射为“工具调用”

- `apps/ui`：运行在 iframe 内的 **UI 内容**（React + Vite）

  - 通过 `window.parent.postMessage(...)` 发送 `type: 'tool' | 'prompt' | ...` 的 action
  - 不直接调用后端工具；只表达“意图”，由 host 决策执行

- `apps/server`：Node/TS 的 **MCP Server（stdio/JSON-RPC）**

  - 使用 `@mcp-ui/server` 的 `createUIResource()` 生成 UI resource
  - 提供 tool（例如 `get_demo_ui`、`demo_echo`）供 host/bridge 调用

- `apps/bridge`：Node/TS 的 **HTTP Bridge**
  - 浏览器无法直接连接 stdio MCP server，所以 bridge 通过 `StdioClientTransport` 启动并调用 MCP server
  - 提供 HTTP：`GET /resource` 与 `POST /ui-action` 给 `apps/host` 使用

---

## 6. 如何运行（本地）

前置：Node.js（建议 18+），npm。

在仓库根目录：

```bash
npm install
```

启动三个进程（可分别开终端）：

```bash
npm run dev:ui
npm run dev:host
npm run dev:bridge
```

访问：

- Host：`http://localhost:5173/`
- Iframe UI：`http://localhost:5174/`
- Bridge：`http://localhost:8787/health`

验证路径：

- Host 渲染来自 bridge 的 UI resource（externalUrl → iframe）
- 在 iframe 内点击按钮发送 `type: 'tool'` action
- Host 收到 `onUIAction` → 调用 bridge `/ui-action` → bridge 调用 MCP tool → 响应回到 iframe 显示

---

## 7. 后续可扩展点（建议）

- 将 `apps/bridge` 替换为你们真实的 API 层（例如 Next.js Route Handlers / NestJS）
- 将 action schema 做成强类型白名单，并加审计/权限/限流
- 增加第二种 resource 类型实验（例如 `rawHtml` 或 `remoteDom`），理解不同渲染与安全边界
