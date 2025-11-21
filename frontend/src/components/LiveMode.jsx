import { useState, useEffect, useRef } from 'react'
import './styles.css'

export default function LiveMode({ apiUrl, onInspect }) {
    const [connected, setConnected] = useState(false)
    const [messages, setMessages] = useState([])
    const [audioEnabled, setAudioEnabled] = useState(false)
    const [videoEnabled, setVideoEnabled] = useState(false)
    const [isRecording, setIsRecording] = useState(false)

    const wsRef = useRef(null)
    const mediaStreamRef = useRef(null)
    const audioContextRef = useRef(null)
    const mediaRecorderRef = useRef(null)
    const audioChunksRef = useRef([])

    useEffect(() => {
        return () => {
            cleanup()
        }
    }, [])

    const cleanup = () => {
        if (wsRef.current) {
            wsRef.current.close()
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop())
        }
        if (audioContextRef.current) {
            audioContextRef.current.close()
        }
    }

    const connect = async () => {
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

        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data)

            if (data.type === 'debug') {
                onInspect(data.debug_type, data.data)
            } else if (data.type === 'gemini_response') {
                // Handle Gemini response
                const responseData = data.data

                if (responseData.serverContent) {
                    const content = responseData.serverContent

                    // Handle text responses
                    if (content.modelTurn && content.modelTurn.parts) {
                        content.modelTurn.parts.forEach(part => {
                            if (part.text) {
                                setMessages(prev => [...prev, {
                                    role: 'assistant',
                                    content: part.text
                                }])
                            }

                            // Handle inline audio data
                            if (part.inlineData && part.inlineData.mimeType === 'audio/pcm') {
                                playAudioChunk(part.inlineData.data)
                            }
                        })
                    }

                    // Handle tool calls or interruptions
                    if (content.turnComplete) {
                        console.log('Turn complete')
                    }
                }

                onInspect('response', responseData)
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

    const playAudioChunk = async (base64Audio) => {
        try {
            // Decode base64 to raw PCM data
            const binaryString = atob(base64Audio)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
            }

            // Create audio context if needed
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 24000 // Gemini Live uses 24kHz
                })
            }

            // Convert PCM16 to float32
            const pcm16 = new Int16Array(bytes.buffer)
            const float32 = new Float32Array(pcm16.length)
            for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 32768.0
            }

            // Create audio buffer and play
            const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000)
            audioBuffer.getChannelData(0).set(float32)

            const source = audioContextRef.current.createBufferSource()
            source.buffer = audioBuffer
            source.connect(audioContextRef.current.destination)
            source.start()

        } catch (error) {
            console.error('Error playing audio:', error)
        }
    }

    const startAudioRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            })

            mediaStreamRef.current = stream
            setAudioEnabled(true)
            setIsRecording(true)

            // Create MediaRecorder for audio chunks
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            })

            mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0 && wsRef.current && connected) {
                    // Convert audio to base64
                    const reader = new FileReader()
                    reader.onloadend = () => {
                        const base64Audio = reader.result.split(',')[1]

                        // Send audio chunk to Gemini
                        const message = {
                            realtime_input: {
                                media_chunks: [{
                                    mime_type: 'audio/pcm',
                                    data: base64Audio
                                }]
                            }
                        }

                        wsRef.current.send(JSON.stringify(message))
                    }
                    reader.readAsDataURL(event.data)
                }
            }

            mediaRecorderRef.current = mediaRecorder
            mediaRecorder.start(100) // Send chunks every 100ms

            setMessages(prev => [...prev, {
                role: 'system',
                content: '🎤 Audio recording started'
            }])

        } catch (error) {
            console.error('Error starting audio:', error)
            setMessages(prev => [...prev, {
                role: 'error',
                content: `❌ Microphone error: ${error.message}`
            }])
        }
    }

    const stopAudioRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop())
            setAudioEnabled(false)
        }

        setMessages(prev => [...prev, {
            role: 'system',
            content: '🎤 Audio recording stopped'
        }])
    }

    const sendMessage = (text) => {
        if (!wsRef.current || !connected) return

        const message = {
            client_content: {
                turns: [{
                    role: 'user',
                    parts: [{ text }]
                }],
                turn_complete: true
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
                    {connected ? '🟢 Live' : '🔴 Offline'}
                </div>

                {!connected && (
                    <button className="btn btn-primary" onClick={connect}>
                        🚀 Connect to Live API
                    </button>
                )}

                {connected && (
                    <div className="controls">
                        {!isRecording ? (
                            <button
                                className="btn btn-success"
                                onClick={startAudioRecording}
                            >
                                🎤 Start Voice Chat
                            </button>
                        ) : (
                            <button
                                className="btn btn-danger"
                                onClick={stopAudioRecording}
                            >
                                ⏹️ Stop Recording
                            </button>
                        )}
                    </div>
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
                        Quick text messages:
                    </p>
                    <button
                        className="btn"
                        onClick={() => sendMessage('Hello! How are you?')}
                        disabled={isRecording}
                    >
                        👋 Say Hello
                    </button>
                    <button
                        className="btn"
                        onClick={() => sendMessage('Tell me a joke')}
                        disabled={isRecording}
                    >
                        😂 Tell a Joke
                    </button>
                    <button
                        className="btn"
                        onClick={() => sendMessage('What can you help me with?')}
                        disabled={isRecording}
                    >
                        💡 Ask Capabilities
                    </button>
                </div>
            )}

            {isRecording && (
                <div className="recording-indicator">
                    <div className="pulse"></div>
                    <span>Listening...</span>
                </div>
            )}
        </div>
    )
}
