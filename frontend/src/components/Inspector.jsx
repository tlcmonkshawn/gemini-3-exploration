import { useState } from 'react'
import './styles.css'

export default function Inspector({ data }) {
    const [activeTab, setActiveTab] = useState('all')

    const filteredData = activeTab === 'all'
        ? data
        : data.filter(item => item.type === activeTab)

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
                    filteredData.slice().reverse().map((item, i) => (
                        <div key={i} className="inspector-item">
                            <div className="inspector-item-header">
                                <span className={`badge ${item.type}`}>{item.type}</span>
                                <span className="timestamp">
                                    {new Date(item.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                            <pre className="inspector-json">
                                {JSON.stringify(item.data, null, 2)}
                            </pre>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
