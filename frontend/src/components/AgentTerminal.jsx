import { useEffect, useRef, useState } from 'react'
import 'xterm/css/xterm.css'

/**
 * Single-agent xterm session.
 * Fills its parent; ResizeObserver keeps cols/rows in sync when panes resize.
 */
export default function AgentTerminal({
  agentId,
  agentName,
  onExitTerminal,
  fill = false,
  compact = false,
  chrome = true,
  className = '',
  onClose,
  focused = false,
  onFocus,
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
    let resizeObserver = null
    let fitTimer = null
    let resizeTimer = null
    let dataDisposable = null

    // Refit at most once per frame-ish while panes glide or get dragged, and only
    // tell the PTY once the size settles — the program redraws once, not per frame.
    let fitFrame = 0
    let lastFit = 0
    let sentDims = ''
    function sendResize() {
      const dims = fitAddonRef.current?.proposeDimensions()
      if (!dims || wsRef.current?.readyState !== WebSocket.OPEN) return
      const key = `${dims.cols}x${dims.rows}`
      if (key === sentDims) return
      sentDims = key
      wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
    }

    function scheduleFit() {
      if (disposed || fitFrame) return
      fitFrame = requestAnimationFrame((now) => {
        fitFrame = 0
        if (disposed || !fitAddonRef.current || !xtermRef.current) return
        if (now - lastFit < 48) {
          // Throttled — make sure the final size still lands
          clearTimeout(fitTimer)
          fitTimer = setTimeout(scheduleFit, 50)
          return
        }
        lastFit = now
        try {
          fitAddonRef.current.fit()
        } catch {
          // ignore fit races during unmount
        }
        clearTimeout(resizeTimer)
        resizeTimer = setTimeout(sendResize, 140)
      })
    }

    async function init() {
      const { Terminal } = await import('xterm')
      const { FitAddon } = await import('xterm-addon-fit')
      if (disposed || !terminalRef.current) return

      term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        fontSize: compact ? 12 : 13,
        fontFamily: '"IBM Plex Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace',
        theme: {
          background: '#0b0b0f',
          foreground: '#c8c8cc',
          cursor: '#e4e4e7',
          cursorAccent: '#0b0b0f',
          selectionBackground: '#ffffff2e',
          black: '#0b0b0f',
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
      xtermRef.current = term
      fitAddonRef.current = fitAddon
      dataDisposable = term.onData(handleInput)
      scheduleFit()
      connectWs(term)

      if (typeof ResizeObserver !== 'undefined' && terminalRef.current) {
        resizeObserver = new ResizeObserver(() => scheduleFit())
        resizeObserver.observe(terminalRef.current)
      }
    }

    function connectWs(activeTerm) {
      if (disposed) return
      setStatus('connecting')

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = `${protocol}//${window.location.host}/api/v1/agents/${agentId}/terminal`

      ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed) { ws.close(); return }
        setConnected(true)
        setStatus('connected')
        if (focused) activeTerm.focus()
        sentDims = '' // fresh PTY — always send our size once
        scheduleFit()
      }

      ws.onmessage = (event) => {
        if (disposed) return
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'output') {
            activeTerm.write(msg.data)
          } else if (msg.type === 'error') {
            activeTerm.writeln(`\r\n\x1b[31mError: ${msg.data}\x1b[0m`)
          } else if (msg.type === 'exit') {
            activeTerm.writeln(`\r\n\x1b[33mProcess exited with code ${msg.code}\x1b[0m`)
            setConnected(false)
            setStatus('exited')
          }
        } catch {
          activeTerm.write(event.data)
        }
      }

      ws.onerror = () => {
        if (disposed) return
        setConnected(false)
        setStatus('error')
        activeTerm.writeln('\r\n\x1b[31mWebSocket connection error\x1b[0m')
      }

      ws.onclose = () => {
        if (disposed) return
        setConnected(false)
        setStatus('disconnected')
        reconnectTimer = setTimeout(() => {
          if (!disposed && xtermRef.current) connectWs(xtermRef.current)
        }, 3000)
      }
    }

    function handleInput(data) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }))
      }
    }

    window.addEventListener('resize', scheduleFit)
    init()

    return () => {
      disposed = true
      clearTimeout(reconnectTimer)
      clearTimeout(fitTimer)
      clearTimeout(resizeTimer)
      cancelAnimationFrame(fitFrame)
      window.removeEventListener('resize', scheduleFit)
      resizeObserver?.disconnect()
      dataDisposable?.dispose()
      if (ws) {
        ws.onclose = null
        ws.close()
      }
      term?.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (focused && xtermRef.current && connected) {
      xtermRef.current.focus()
    }
  }, [focused, connected])

  const statusColors = {
    connecting: 'text-amber-300',
    connected: 'text-zinc-300',
    disconnected: 'text-zinc-500',
    error: 'text-red-400',
    exited: 'text-zinc-500',
  }

  return (
    <div
      className={`flex flex-col min-h-0 min-w-0 ${fill ? 'h-full' : 'h-96'} ${className}`}
      onMouseDown={onFocus}
    >
      {chrome && (
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-white/[0.05] bg-ink-1 px-3 font-mono text-[11px]">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            connected ? 'bg-zinc-50 shadow-lit' : 'bg-zinc-600'
          }`} />
          <span className={`${statusColors[status] || 'text-zinc-500'} shrink-0`}>
            {status}
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-400 truncate" title={agentName || agentId}>
            {agentName || agentId?.slice(0, 8)}
          </span>
          <div className="flex-1" />
          {onExitTerminal && (
            <button
              type="button"
              onClick={onExitTerminal}
              className="text-zinc-500 hover:text-zinc-200 underline"
              title="Switch back to chat (GUI) view"
            >
              GUI
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-500 hover:text-red-300 px-1"
              title="Close pane"
            >
              ✕
            </button>
          )}
          {!connected && (
            <button
              type="button"
              onClick={() => {
                if (wsRef.current) wsRef.current.close()
              }}
              className="text-zinc-500 hover:text-zinc-200 underline"
            >
              reconnect
            </button>
          )}
        </div>
      )}
      <div
        ref={terminalRef}
        className="flex-1 min-h-0 bg-ink-1 overflow-hidden"
        onClick={() => {
          onFocus?.()
          xtermRef.current?.focus()
        }}
      />
    </div>
  )
}
