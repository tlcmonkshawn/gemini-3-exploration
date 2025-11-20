import { useState } from 'react'
import DeepMode from './components/DeepMode'
import LiveMode from './components/LiveMode'
import Inspector from './components/Inspector'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://34.31.217.123:8001'

function App() {
    const [activeTab, setActiveTab] = useState('deep')
    const [inspectorData, setInspectorData] = useState([])

    const addInspectorData = (type, data) => {
        setInspectorData(prev => [...prev, {
            type,
            data,
            timestamp: new Date().toISOString()
        }])
    }

    return (
        <div className="app-container">
            <header className="app-header glass">
                <h1>🔬 Gemini Explorer</h1>
                <p>Test all modalities of Gemini 3 Pro & 2.5 Flash</p>
            </header>

            <div className="main-layout">
                <div className="content-area">
                    <div className="tab-container">
                        <button
                            className={`tab ${activeTab === 'deep' ? 'active' : ''}`}
                            onClick={() => setActiveTab('deep')}
                        >
                            🧠 Deep Mode (Gemini 3 Pro)
                        </button>
                        <button
                            className={`tab ${activeTab === 'live' ? 'active' : ''}`}
                            onClick={() => setActiveTab('live')}
                        >
                            ⚡ Live Mode (Gemini 2.5 Flash)
                        </button>
                    </div>

                    <div className="tab-content glass">
                        {activeTab === 'deep' ? (
                            <DeepMode
                                apiUrl={API_URL}
                                onInspect={addInspectorData}
                            />
                        ) : (
                            <LiveMode
                                apiUrl={API_URL}
                                onInspect={addInspectorData}
                            />
                        )}
                    </div>
                </div>

                <Inspector data={inspectorData} />
            </div>
        </div>
    )
}

export default App
