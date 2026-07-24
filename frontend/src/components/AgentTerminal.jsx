import { useEffect, useRef, useState } from 'react'

export default function AgentTerminal({
  agentId,
  agentName,
  externalMessages,
  onMessagesChange,
  onExitTerminal,
}) {
  const terminalRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('connecting')

  useEffect(() => {
    let term = null
    let fitAddon = null
    let ws = null
    let reconnectTimer = null
    let disposed = false

    async function init() {
      // Dynamic import xterm
      const { Terminal } = await import('xterm')
      const { FitAddon } = await import('xterm-addon-fit')

      if (disposed) return

      term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        fontSize: 13,
        fontFamily: '"IBM Plex Mono", "Cascadia Code", "Fira Code", monospace',
        theme: {
          background: '#0a0a0f',
          foreground: '#c8c8cc',
          cursor: '#c8c8cc',
          selectionBackground: '#3a3a4f',
          black: '#0a0a0f',
          red: '#e04e4e',
          green: '#4e9a4e',
          yellow: '#c8a84e',
          blue: '#4e8ac8',
          magenta: '#c84e8a',
          cyan: '#4ec8c8',
          white: '#c8c8cc',
          brightBlack: '#3a3a4f',
          brightRed: '#f06060',
          brightGreen: '#60b060',
          brightYellow: '#e0c060',
          brightBlue: '#60a0e0',
          brightMagenta: '#e060a0',
          brightCyan: '#60e0e0',
          brightWhite: '#ffffff',
        },
        allowTransparency: false,
        scrollback: 5000,
        convertEol: true,
      })

      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)

      term.open(terminalRef.current)
      fitAddon.fit()

      xtermRef.current = term
      fitAddonRef.current = fitAddon

      // Connect WebSocket
      connectWs(term)
    }

    function connectWs(term) {
      if (disposed) return
      setStatus('connecting')

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.hostname
      const url = `${protocol}//${host}:8002/api/v1/agents/${agentId}/terminal`

      ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed) { ws.close(); return }
        setConnected(true)
        setStatus('connected')
        term.focus()
        // Send initial resize
        if (fitAddonRef.current) {
          const dims = fitAddonRef.current.proposeDimensions()
          if (dims) {
            ws.send(JSON.stringify({
              type: 'resize',
              cols: dims.cols,
              rows: dims.rows,
            }))
          }
        }
      }

      ws.onmessage = (event) => {
        if (disposed) return
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'output') {
            term.write(msg.data)
          } else if (msg.type === 'error') {
            term.writeln(`\r\n\x1b[31mError: ${msg.data}\x1b[0m`)
          } else if (msg.type === 'exit') {
            term.writeln(`\r\n\x1b[33mProcess exited with code ${msg.code}\x1b[0m`)
            setConnected(false)
            setStatus('exited')
          }
        } catch (e) {
          // Binary data or parse error — write raw
          term.write(event.data)
        }
      }

      ws.onerror = () => {
        if (disposed) return
        setConnected(false)
        setStatus('error')
        term.writeln('\r\n\x1b[31mWebSocket connection error\x1b[0m')
      }

      ws.onclose = () => {
        if (disposed) return
        setConnected(false)
        setStatus('disconnected')
        // Auto-reconnect after 3s
        reconnectTimer = setTimeout(() => {
          if (!disposed && xtermRef.current) {
            connectWs(xtermRef.current)
          }
        }, 3000)
      }
    }

    // Handle terminal input → WebSocket
    function handleInput(data) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }))
      }
    }

    // Handle resize
    function handleResize() {
      if (fitAddonRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        fitAddonRef.current.fit()
        const dims = fitAddonRef.current.proposeDimensions()
        if (dims) {
          wsRef.current.send(JSON.stringify({
            type: 'resize',
            cols: dims.cols,
            rows: dims.rows,
          }))
        }
      }
    }

    // Attach event listeners after terminal is ready
    const attachListener = setInterval(() => {
      if (xtermRef.current) {
        xtermRef.current.onData(handleInput)
        clearInterval(attachListener)
      }
    }, 100)

    window.addEventListener('resize', handleResize)

    init()

    return () => {
      disposed = true
      clearInterval(attachListener)
      clearTimeout(reconnectTimer)
      window.removeEventListener('resize', handleResize)

      if (ws) {
        ws.onclose = null // prevent reconnect
        ws.close()
      }
      if (term) {
        term.dispose()
      }
    }
  }, [agentId])

  const statusColors = {
    connecting: 'text-yellow-400',
    connected: 'text-emerald-400',
    disconnected: 'text-zinc-500',
    error: 'text-red-400',
    exited: 'text-zinc-500',
  }

  return (
    <div className="flex flex-col h-96">
      {/* Terminal toolbar */}
      <div className="flex items-center px-3 py-1 bg-zinc-900 border-t border-zinc-800 text-xs font-mono">
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          connected ? 'bg-emerald-400' : 'bg-zinc-500'
        }`} />
        <span className={`${statusColors[status] || 'text-zinc-500'}`}>
          TUI {status}
        </span>
        <span className="text-zinc-600 mx-2">|</span>
        <span className="text-zinc-500">{agentName || agentId?.slice(0, 8)}</span>
        <div className="flex-1" />
        {/* Exit terminal button */}
        {onExitTerminal && (
          <button
            onClick={onExitTerminal}
            className="text-zinc-500 hover:text-zinc-300 underline text-xs mr-2"
            title="Switch back to chat (GUI) view"
          >
            [GUI]
          </button>
        )}
        {!connected && (
          <button
            onClick={() => {
              if (xtermRef.current) {
                if (wsRef.current) wsRef.current.close()
              }
            }}
            className="text-zinc-500 hover:text-zinc-300 underline text-xs"
          >
            reconnect
          </button>
        )}
      </div>
      {/* Terminal container */}
      <div
        ref={terminalRef}
        className="flex-1 bg-[#0a0a0f] overflow-hidden"
        style={{ minHeight: '200px' }}
      />
    </div>
  )
}
