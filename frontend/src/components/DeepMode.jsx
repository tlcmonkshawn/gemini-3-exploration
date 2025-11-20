import { useState } from 'react'
import axios from 'axios'
import './styles.css'

export default function DeepMode({ apiUrl, onInspect }) {
    const [message, setMessage] = useState('')
    const [files, setFiles] = useState([])
    const [messages, setMessages] = useState([])
    const [loading, setLoading] = useState(false)
    const [thinkingLevel, setThinkingLevel] = useState('low')
    const [mediaResolution, setMediaResolution] = useState('medium')

    const handleFileUpload = async (e) => {
        const uploadedFiles = Array.from(e.target.files)
        setLoading(true)

        try {
            const fileUris = []
            for (const file of uploadedFiles) {
                const formData = new FormData()
                formData.append('file', file)

                onInspect('request', { action: 'upload', filename: file.name })

                const response = await axios.post(`${apiUrl}/api/deep/upload`, formData)
                fileUris.push(response.data.file_uri)

                onInspect('response', response.data)
            }

            setFiles(prev => [...prev, ...fileUris])
            setMessages(prev => [...prev, {
                role: 'system',
                content: `✅ Uploaded ${uploadedFiles.length} file(s)`
            }])
        } catch (error) {
            console.error('Upload error:', error)
            setMessages(prev => [...prev, {
                role: 'error',
                content: `❌ Upload failed: ${error.message}`
            }])
        }

        setLoading(false)
    }

    const handleSend = async () => {
        if (!message.trim() && files.length === 0) return

        setLoading(true)
        setMessages(prev => [...prev, { role: 'user', content: message }])

        try {
            const requestPayload = {
                message,
                file_uris: files,
                thinking_level: thinkingLevel,
                media_resolution: mediaResolution
            }

            onInspect('request', requestPayload)

            const response = await fetch(`${apiUrl}/api/deep/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload)
            })

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let aiResponse = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value)
                const lines = chunk.split('\n')

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6))

                        if (data.type === 'text') {
                            aiResponse += data.content
                            setMessages(prev => {
                                const newMsgs = [...prev]
                                if (newMsgs[newMsgs.length - 1]?.role === 'assistant') {
                                    newMsgs[newMsgs.length - 1].content = aiResponse
                                } else {
                                    newMsgs.push({ role: 'assistant', content: aiResponse })
                                }
                                return newMsgs
                            })
                        } else if (data.type === 'debug') {
                            onInspect('response', data.data)
                        } else if (data.type === 'error') {
                            setMessages(prev => [...prev, {
                                role: 'error',
                                content: `❌ API Error: ${data.message}`
                            }])
                            onInspect('error', data)
                        }
                    }
                }
            }

            setMessage('')
            setFiles([])
        } catch (error) {
            console.error('Chat error:', error)
            setMessages(prev => [...prev, {
                role: 'error',
                content: `❌ Error: ${error.message}`
            }])
        }

        setLoading(false)
    }

    return (
        <div className="deep-mode">
            <div className="controls">
                <div className="control-group">
                    <label>Thinking Level:</label>
                    <select value={thinkingLevel} onChange={(e) => setThinkingLevel(e.target.value)}>
                        <option value="low">Low (Fast)</option>
                        <option value="high">High (Detailed Reasoning)</option>
                    </select>
                </div>

                <div className="control-group">
                    <label>Media Resolution:</label>
                    <select value={mediaResolution} onChange={(e) => setMediaResolution(e.target.value)}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High (Best for details)</option>
                    </select>
                </div>

                <div className="control-group">
                    <label>Upload Files:</label>
                    <input
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        accept="image/*,video/*,audio/*,.pdf"
                    />
                </div>
            </div>

            {files.length > 0 && (
                <div className="file-chips">
                    {files.map((uri, i) => (
                        <span key={i} className="chip">📎 File {i + 1}</span>
                    ))}
                </div>
            )}

            <div className="messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`message-bubble ${msg.role}-message`}>
                        {msg.content}
                    </div>
                ))}
            </div>

            <div className="input-area">
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ask Gemini 3 Pro anything..."
                    rows={3}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSend()
                        }
                    }}
                />
                <button
                    className="btn btn-primary"
                    onClick={handleSend}
                    disabled={loading}
                >
                    {loading ? '⏳ Processing...' : '🚀 Send'}
                </button>
            </div>
        </div>
    )
}
