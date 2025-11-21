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
    const videoRef = useRef(null)
    const videoFrameIntervalRef = useRef(null)

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
        if (videoFrameIntervalRef.current) {
            clearInterval(videoFrameIntervalRef.current)
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
                const responseData = data.data

                if (responseData.serverContent) {
                    const content = responseData.serverContent

                    if (content.modelTurn && content.modelTurn.parts) {
                        content.modelTurn.parts.forEach(part => {
                            if (part.text) {
                                setMessages(prev => [...prev, {
                                    role: 'assistant',
                                    content: part.text
                                }])
                            }

                            if (part.inlineData && part.inlineData.mimeType === 'audio/pcm') {
                                playAudioChunk(part.inlineData.data)
                            }
                        })
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
            const binaryString = atob(base64Audio)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
            }

            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 24000
                })
            }

            const pcm16 = new Int16Array(bytes.buffer)
            const float32 = new Float32Array(pcm16.length)
            for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 32768.0
            }

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

    const startMedia = async () => {
        try {
            // Check if getUserMedia is available (requires HTTPS or localhost)
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera/microphone access requires HTTPS. Please access this site via HTTPS or localhost.')
            }

            const constraints = {
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                },
                video: videoEnabled ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                } : false
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints)

            mediaStreamRef.current = stream
            setAudioEnabled(true)
            setIsRecording(true)

            // Setup video preview
            if (videoEnabled && videoRef.current) {
                videoRef.current.srcObject = stream
                videoRef.current.play()

                // Start sending video frames
                startVideoFrameCapture()
            }

            // Audio recording
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            })

            mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0 && wsRef.current && connected) {
                    const reader = new FileReader()
                    reader.onloadend = () => {
                        const base64Audio = reader.result.split(',')[1]

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
            mediaRecorder.start(100)

            const mediaTypes = videoEnabled ? 'audio and video' : 'audio'
            setMessages(prev => [...prev, {
                role: 'system',
                content: `🎤 Recording ${mediaTypes} started`
            }])

        } catch (error) {
            console.error('Error starting media:', error)
            setMessages(prev => [...prev, {
                role: 'error',
                content: `❌ Media error: ${error.message}`
            }])
        }
    }

    const startVideoFrameCapture = () => {
        // Capture and send video frames at ~2 FPS to reduce bandwidth
        videoFrameIntervalRef.current = setInterval(() => {
            if (videoRef.current && wsRef.current && connected) {
                const canvas = document.createElement('canvas')
                canvas.width = 640
                canvas.height = 360
                const ctx = canvas.getContext('2d')
                ctx.drawImage(videoRef.current, 0, 0, 640, 360)

                canvas.toBlob((blob) => {
                    if (blob) {
                        const reader = new FileReader()
                        reader.onloadend = () => {
                            const base64Image = reader.result.split(',')[1]

                            const message = {
                                realtime_input: {
                                    media_chunks: [{
                                        mime_type: 'image/jpeg',
                                        data: base64Image
                                    }]
                                }
                            }

                            wsRef.current.send(JSON.stringify(message))
                        }
                        reader.readAsDataURL(blob)
                    }
                }, 'image/jpeg', 0.8)
            }
        }, 500) // 2 FPS
    }

    const stopMedia = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
        }

        if (videoFrameIntervalRef.current) {
            clearInterval(videoFrameIntervalRef.current)
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop())
            setAudioEnabled(false)

            if (videoRef.current) {
                videoRef.current.srcObject = null
            }
        }

        setMessages(prev => [...prev, {
            role: 'system',
            content: '⏹️ Recording stopped'
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

                {connected && !isRecording && (
                    <div className="controls">
                        <label className="toggle-label">
                            <input
                                type="checkbox"
                                checked={videoEnabled}
                                onChange={(e) => setVideoEnabled(e.target.checked)}
                            />
                            📹 Enable Camera
                        </label>

                        <button
                            className="btn btn-success"
                            onClick={startMedia}
                        >
                            🎤 Start {videoEnabled ? 'Audio + Video' : 'Voice Chat'}
                        </button>
                    </div>
                )}

                {isRecording && (
                    <button
                        className="btn btn-danger"
                        onClick={stopMedia}
                    >
                        ⏹️ Stop Recording
                    </button>
                )}
            </div>

            {videoEnabled && isRecording && (
                <div className="video-preview">
                    <video ref={videoRef} autoPlay muted playsInline />
                    <div className="video-label">📹 Your Camera</div>
                </div>
            )}

            <div className="messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`message-bubble ${msg.role}-message`}>
                        {msg.content}
                    </div>
                ))}
            </div>

            {connected && !isRecording && (
                <div className="quick-actions">
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '10px' }}>
                        Quick text messages:
                    </p>
                    <button
                        className="btn"
                        onClick={() => sendMessage('Hello! How are you?')}
                    >
                        👋 Say Hello
                    </button>
                    <button
                        className="btn"
                        onClick={() => sendMessage('Tell me a joke')}
                    >
                        😂 Tell a Joke
                    </button>
                    <button
                        className="btn"
                        onClick={() => sendMessage('What can you see in this image?')}
                        disabled={!videoEnabled}
                    >
                        👁️ Describe What You See
                    </button>
                </div>
            )}

            {isRecording && (
                <div className="recording-indicator">
                    <div className="pulse"></div>
                    <span>{videoEnabled ? '🎥 Recording video + audio' : '🎤 Listening...'}</span>
                </div>
            )}
        </div>
    )
}
