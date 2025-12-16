import cors from 'cors'
import express from 'express'
import { fileURLToPath } from 'node:url'
import * as z from 'zod/v4'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const PORT = Number(process.env.PORT ?? 8787)

const ToolUIActionSchema = z.object({
  type: z.literal('tool'),
  messageId: z.string().optional(),
  payload: z.object({
    toolName: z.string(),
    params: z.record(z.unknown())
  })
})

type ToolUIAction = z.infer<typeof ToolUIActionSchema>

function getRepoRoot(): string {
  // apps/bridge/src/index.ts -> ../../../
  return fileURLToPath(new URL('../../../', import.meta.url))
}

function getTsxCliPath(): string {
  // Use the repo-level tsx install so the bridge can spawn TypeScript MCP server directly.
  return fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url))
}

async function createMcpClient() {
  const repoRoot = getRepoRoot()
  const tsxCli = getTsxCliPath()

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCli, 'apps/server/src/index.ts'],
    cwd: repoRoot,
    stderr: 'inherit'
  })

  const client = new Client({ name: 'spike-mcp-ui-bridge', version: '0.0.0' })
  await client.connect(transport)

  return { client, transport }
}

async function main() {
  const { client, transport } = await createMcpClient()

  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.get('/resource', async (_req, res) => {
    try {
      const result = await client.callTool({ name: 'get_demo_ui', arguments: {} })
      const uiResource = result.content?.find((c: any) => c?.type === 'resource') as any
      if (!uiResource) {
        res.status(500).json({ ok: false, error: 'No UI resource found in tool result' })
        return
      }
      res.setHeader('cache-control', 'no-store')
      res.json(uiResource)
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.post('/ui-action', async (req, res) => {
    const parsed = ToolUIActionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.message })
      return
    }

    const action: ToolUIAction = parsed.data

    try {
      const result = await client.callTool({
        name: action.payload.toolName,
        arguments: action.payload.params
      })

      // Return something JSON-friendly for the host to send back to the iframe.
      res.json({
        ok: true,
        tool: action.payload.toolName,
        result
      })
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })

  const server = app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[bridge] listening on http://localhost:${PORT}`)
  })

  process.on('SIGINT', async () => {
    server.close()
    await transport.close()
    process.exit(0)
  })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[bridge] fatal error:', err)
  process.exit(1)
})


