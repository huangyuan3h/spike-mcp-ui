import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

type UIActionMessage =
  | {
      type: 'tool'
      messageId?: string
      payload: { toolName: string; params: Record<string, unknown> }
    }
  | {
      type: string
      messageId?: string
      payload?: unknown
    }

function App() {
  const [lastMessageId, setLastMessageId] = useState<string | null>(null)
  const [lastResponse, setLastResponse] = useState<unknown>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const targetOrigin = useMemo(() => {
    // For local spike we allow any origin. In production, always restrict this.
    return '*'
  }, [])

  const sendToolAction = useCallback(() => {
    setLastError(null)
    const messageId = globalThis.crypto?.randomUUID?.() ?? String(Date.now())
    setLastMessageId(messageId)

    const action: UIActionMessage = {
      type: 'tool',
      messageId,
      payload: {
        toolName: 'demo_echo',
        params: {
          clickedAt: new Date().toISOString(),
          from: 'apps/ui',
          note: 'This is a UI action message posted from inside the iframe.'
        }
      }
    }

    // The host-side @mcp-ui/client listens for window "message" events from this iframe.
    window.parent.postMessage(action, targetOrigin)
  }, [targetOrigin])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as UIActionMessage | null
      if (!data || typeof data !== 'object') return

      // @mcp-ui/client host responds with this message type after onUIAction resolves.
      if (data.type === 'ui-message-response' && data.messageId && data.messageId === lastMessageId) {
        const payload = data.payload as any
        if (payload?.error) {
          setLastError(String(payload.error))
          return
        }
        setLastResponse(payload?.response ?? null)
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [lastMessageId])

  return (
    <>
      <h2 style={{ marginTop: 0 }}>MCP-UI Iframe App</h2>
      <p style={{ marginTop: 0 }}>
        This app runs <strong>inside an iframe</strong>. Clicking the button below posts a UI action
        to the host.
      </p>
      <div className="card">
        <button onClick={sendToolAction}>Send UI Action (type: tool)</button>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Last messageId: {lastMessageId ?? 'n/a'}</div>
        {lastError ? (
          <pre style={{ color: '#ff6b6b', whiteSpace: 'pre-wrap' }}>{lastError}</pre>
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {lastResponse ? JSON.stringify(lastResponse, null, 2) : 'No response yet.'}
          </pre>
        )}
      </div>
    </>
  )
}

export default App
