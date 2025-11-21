import { useState } from 'react'
import axios from 'axios'
import './styles.css'

export default function DeepMode({ apiUrl, onInspect }) {
    const [message, setMessage] = useState('')
    const [files, setFiles] = useState([])
    const [messages, setMessages] = useState([])
    const [conversationHistory, setConversationHistory] = useState([]) // For API with thought signatures
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

        // Build user message parts for display
        const userDisplayMessage = message
        setMessages(prev => [...prev, { role: 'user', content: userDisplayMessage }])

        // Build user message parts for API (including files and text)
        const userParts = []
        for (const fileUri of files) {
            userParts.push({ file_uri: fileUri })
        }
        userParts.push({ text: message })

        try {
            const requestPayload = {
                message,
                file_uris: files,
                thinking_level: thinkingLevel,
                media_resolution: mediaResolution,
                history: conversationHistory // Send full conversation history
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
            let currentThoughtSignature = null

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
                        } else if (data.type === 'thought_signature') {
                            // Capture the thought signature for next request
                            currentThoughtSignature = data.signature
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

            // Update conversation history for next request
            // Add user message
            setConversationHistory(prev => [...prev, {
                role: 'user',
                parts: userParts
            }])

            // Add assistant message with thought signature
            const assistantParts = []
            if (aiResponse) {
                assistantParts.push({ text: aiResponse })
            }
            if (currentThoughtSignature) {
                assistantParts.push({ thought_signature: currentThoughtSignature })
            }

            setConversationHistory(prev => [...prev, {
                role: 'model',
                parts: assistantParts
            }])

            setMessage('')
            // Keep files attached for follow-up questions
            // setFiles([]) // Removed: files should persist in conversation
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

            </div>

            <div className="messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`message-bubble ${msg.role}-message`}>
                        {msg.content}
                    </div>
                ))}
            </div>

            <div className="input-area">
                <div>
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

                <div className="file-upload-section">
                    <input
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        accept="image/*,video/*,audio/*,.pdf"
                        id="file-upload"
                        style={{ display: 'none' }}
                    />
                    <label htmlFor="file-upload" className="btn btn-secondary">
                        📎 Attach Files
                    </label>

                    {files.length > 0 && (
                        <div className="attached-files">
                            <div className="files-header">
                                <strong>Attached Files ({files.length})</strong>
                                <button
                                    className="btn-link"
                                    onClick={() => setFiles([])}
                                    title="Clear all files"
                                >
                                    Clear All
                                </button>
                            </div>
                            <div className="file-list">
                                {files.map((uri, i) => (
                                    <div key={i} className="file-item">
                                        <span className="file-name">📎 File {i + 1}</span>
                                        <button
                                            className="btn-remove"
                                            onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                                            title={`Remove file ${i + 1}`}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
