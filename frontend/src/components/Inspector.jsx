import { useState } from 'react'
import './styles.css'

export default function Inspector({ data }) {
    const [activeTab, setActiveTab] = useState('all')
    const [expandedItems, setExpandedItems] = useState(new Set())

    const filteredData = activeTab === 'all'
        ? data
        : data.filter(item => item.type === activeTab)

    const toggleItem = (index) => {
        const newExpanded = new Set(expandedItems)
        if (newExpanded.has(index)) {
            newExpanded.delete(index)
        } else {
            newExpanded.add(index)
        }
        setExpandedItems(newExpanded)
    }

    return (
        <div className="inspector glass">
            <div className="inspector-header">
                <h3>🔍 Inspector</h3>
                <div className="inspector-tabs">
                    <button
                        className={activeTab === 'all' ? 'active' : ''}
                        onClick={() => setActiveTab('all')}
                    >
                        All
                    </button>
                    <button
                        className={activeTab === 'request' ? 'active' : ''}
                        onClick={() => setActiveTab('request')}
                    >
                        Requests
                    </button>
                    <button
                        className={activeTab === 'response' ? 'active' : ''}
                        onClick={() => setActiveTab('response')}
                    >
                        Responses
                    </button>
                </div>
            </div>

            <div className="inspector-content">
                {filteredData.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
                        No data yet. Start chatting to see API traffic!
                    </p>
                ) : (
                    filteredData.slice().reverse().map((item, i) => {
                        const isExpanded = expandedItems.has(i)
                        const jsonStr = JSON.stringify(item.data, null, 2)
                        const preview = jsonStr.length > 100
                            ? jsonStr.substring(0, 100) + '...'
                            : jsonStr

                        return (
                            <div key={i} className="inspector-item">
                                <div
                                    className="inspector-item-header clickable"
                                    onClick={() => toggleItem(i)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                                        <span className={`badge ${item.type}`}>{item.type}</span>
                                    </div>
                                    <span className="timestamp">
                                        {new Date(item.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                                {isExpanded && (
                                    <pre className="inspector-json">
                                        {jsonStr}
                                    </pre>
                                )}
                                {!isExpanded && (
                                    <div className="inspector-preview">
                                        {preview}
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
