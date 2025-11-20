import { useState, useEffect, useRef } from 'react'
import './styles.css'

export default function LiveMode({ apiUrl, onInspect }) {
    const [connected, setConnected] = useState(false)
    const [messages, setMessages] = useState([])
    const wsRef = useRef(null)

    useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.close()
            }
        }
    }, [])

    const connect = () => {
        const wsUrl = apiUrl.replace('http', 'ws') + '/ws/live'
        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
            setConnected(true)
            setMessages(prev => [...prev, {
                role: 'system',
                content: '✅ Connected to Gemini 2.5 Flash Live API'
            }])
            onInspect('connection', { status: 'connected' })
        }

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data)

            if (data.type === 'debug') {
                onInspect(data.debug_type, data.data)
            } else if (data.type === 'gemini_response') {
                // Handle Gemini response
                if (data.data.serverContent) {
                    const content = data.data.serverContent
                    if (content.modelTurn && content.modelTurn.parts) {
                        content.modelTurn.parts.forEach(part => {
                            if (part.text) {
                                setMessages(prev => [...prev, {
                                    role: 'assistant',
                                    content: part.text
                                }])
                            }
                        })
                    }
                }

                onInspect('response', data.data)
            }
        }

        ws.onerror = (error) => {
            console.error('WebSocket error:', error)
            setMessages(prev => [...prev, {
                role: 'error',
                content: '❌ Connection error'
            }])
        }

        ws.onclose = () => {
            setConnected(false)
            setMessages(prev => [...prev, {
                role: 'system',
                content: '🔌 Disconnected'
            }])
        }

        wsRef.current = ws
    }

    const sendMessage = (text) => {
        if (!wsRef.current || !connected) return

        const message = {
            client_content: {
                turns: [{
                    role: 'user',
                    parts: [{ text }]
                }]
            }
        }

        wsRef.current.send(JSON.stringify(message))
        setMessages(prev => [...prev, {
            role: 'user',
            content: text
        }])
        onInspect('request', message)
    }

    return (
        <div className="live-mode">
            <div className="status">
                <div className={`status-indicator ${connected ? 'connected' : ''}`}>
                    {connected ? '🟢 Connected' : '🔴 Disconnected'}
                </div>
                {!connected && (
                    <button className="btn btn-primary" onClick={connect}>
                        Connect to Live API
                    </button>
                )}
            </div>

            <div className="messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`message-bubble ${msg.role}-message`}>
                        {msg.content}
                    </div>
                ))}
            </div>

            {connected && (
                <div className="quick-actions">
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '10px' }}>
                        Quick tests (text-only for now):
                    </p>
                    <button
                        className="btn"
                        onClick={() => sendMessage('Hello! Can you hear me?')}
                    >
                        Test Text
                    </button>
                    <button
                        className="btn"
                        onClick={() => sendMessage('Tell me a joke')}
                    >
                        Tell a Joke
                    </button>
                </div>
            )}
        </div>
    )
}
