import React, { useState, useRef, useEffect } from 'react';
import { FiUploadCloud, FiCpu } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API = 'http://localhost:8000';

const PIPELINE_STEPS = [
  { key: 'Extracting Text', label: 'Extract PDF Text' },
  { key: 'Medical Extraction', label: 'Medical Data Extraction (AI)' },
  { key: 'Risk Assessment', label: 'Risk Score Calculation' },
  { key: 'Clinical Summary', label: 'Clinical Summary (AI)' },
  { key: 'Airport Summary', label: 'Airport Screening Summary (AI)' },
  { key: 'Finalizing', label: 'Saving Results' },
  { key: 'Complete', label: 'Pipeline Complete' },
];

export default function UploadPage({ token }) {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('gemini-3-flash-lite');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('extraction');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/models`)
      .then((r) => r.json())
      .then(setModels)
      .catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Poll pipeline status
  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/pipeline/status/${jobId}`);
        const data = await res.json();
        setPipelineStatus(data);
        if (data.stage === 'Complete' || data.stage === 'Error') {
          clearInterval(pollRef.current);
          if (data.result) setResults(data.result);
        }
      } catch {
        clearInterval(pollRef.current);
      }
    }, 1500);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResults(null);
    setPipelineStatus(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', selectedModel);

      const res = await fetch(`${API}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      setJobId(data.job_id);
    } catch (e) {
      console.error('Upload failed', e);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === 'application/pdf') {
      setFile(droppedFile);
    }
  };

  const currentStageIdx = pipelineStatus
    ? PIPELINE_STEPS.findIndex((s) => s.key === pipelineStatus.stage)
    : -1;

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">Upload Medical Report</h1>
        <p className="page-subtitle">Upload a PDF to run the full medical intelligence pipeline</p>
      </div>

      {/* Upload Zone */}
      {!jobId && (
        <>
          <div
            className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="upload-zone-icon">📄</div>
            <div className="upload-zone-text">
              {file ? file.name : 'Drop your PDF here or click to browse'}
            </div>
            <div className="upload-zone-sub">
              {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'Supports PDF files only • No OCR'}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => setFile(e.target.files[0])}
            />
          </div>


          {file && (
            <button
              className="auth-submit"
              style={{ marginTop: 16, width: '100%', maxWidth: 400, display: 'block', marginLeft: 'auto', marginRight: 'auto' }}
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : '🚀 Run Medical Pipeline'}
            </button>
          )}
        </>
      )}

      {/* Pipeline Progress */}
      {jobId && !results && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <span className="card-title">Pipeline Progress</span>
          </div>
          <div className="pipeline-progress">
            {PIPELINE_STEPS.map((step, i) => {
              let status = 'pending';
              if (i < currentStageIdx) status = 'done';
              else if (i === currentStageIdx) status = pipelineStatus?.stage === 'Error' ? 'error' : 'active';
              return (
                <div key={step.key} className="pipeline-step">
                  <div className={`pipeline-step-dot ${status}`} />
                  <span className="pipeline-step-label">{step.label}</span>
                  <span className="pipeline-step-status">
                    {status === 'done' ? '✓' : status === 'active' ? '⏳' : status === 'error' ? '✗' : ''}
                  </span>
                </div>
              );
            })}
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${pipelineStatus?.progress || 0}%` }} />
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              {pipelineStatus?.status || 'Starting...'}
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {results && results.status === 'success' && (
        <div style={{ marginTop: 20 }}>
          {/* Risk Score */}
          {results.risk && (
            <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: 24 }}>
              <div className={`risk-score-large ${results.risk.risk_level}`}>
                <span className="risk-score-number">{results.risk.risk_score}</span>
                <span className="risk-score-label">{results.risk.risk_level}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                {results.risk.recommendations?.map((r, i) => (
                  <span key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--surface)', padding: '4px 12px', borderRadius: 'var(--radius-full)' }}>{r}</span>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="tabs">
            <button className={`tab ${activeTab === 'extraction' ? 'active' : ''}`} onClick={() => setActiveTab('extraction')}>Medical Data</button>
            <button className={`tab ${activeTab === 'clinical' ? 'active' : ''}`} onClick={() => setActiveTab('clinical')}>Clinical Summary</button>
            <button className={`tab ${activeTab === 'airport' ? 'active' : ''}`} onClick={() => setActiveTab('airport')}>Airport Summary</button>
            <button className={`tab ${activeTab === 'risk' ? 'active' : ''}`} onClick={() => setActiveTab('risk')}>Risk Breakdown</button>
          </div>

          <div className="card">
            <div className="card-body">
              {activeTab === 'extraction' && results.extraction && (
                <div className="markdown-body">
                  <h2>Extracted Medical Data</h2>
                  {results.extraction.patient_name && <p><strong>Patient:</strong> {results.extraction.patient_name}</p>}
                  {results.extraction.age && <p><strong>Age:</strong> {results.extraction.age}</p>}
                  {results.extraction.gender && <p><strong>Gender:</strong> {results.extraction.gender}</p>}
                  
                  {['travel_and_exposure', 'real_time_iot_vitals', 'active_symptoms', 'critical_lab_markers', 'underlying_vulnerabilities'].map(section => {
                    const data = results.extraction[section];
                    if (!data || typeof data !== 'object') return null;
                    const entries = Object.entries(data).filter(([_, v]) => v !== null && v !== false && v !== '');
                    if (entries.length === 0) return null;
                    
                    return (
                      <div key={section}>
                        <h3 style={{ textTransform: 'capitalize' }}>{String(section).replace(/_/g, ' ')}</h3>
                        <ul>
                          {entries.map(([k, v]) => (
                            <li key={k}>
                              <strong>{String(k).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:</strong> {v === true ? 'Yes' : (typeof v === 'object' ? JSON.stringify(v) : String(v))}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === 'clinical' && results.clinical_summary && (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{results.clinical_summary}</ReactMarkdown>
                </div>
              )}

              {activeTab === 'airport' && results.airport_summary && (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{results.airport_summary}</ReactMarkdown>
                </div>
              )}

              {activeTab === 'risk' && results.risk && (
                <div>
                  <h3 style={{ marginBottom: 12 }}>Risk Score Breakdown</h3>
                  {results.risk.breakdown?.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.85rem' }}>{item.factor}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--risk-high)' }}>+{item.points}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 700, fontSize: '1rem' }}>
                    <span>Total</span>
                    <span style={{ color: `var(--risk-${results.risk.risk_level.toLowerCase()})` }}>{results.risk.risk_score}/100</span>
                  </div>

                  <h3 style={{ marginTop: 20, marginBottom: 12 }}>Score Legend</h3>
                  <table className="data-table" style={{ marginBottom: 0 }}>
                    <thead><tr><th>Score Range</th><th>Level</th><th>Action</th></tr></thead>
                    <tbody>
                      <tr style={results.risk.risk_level === 'LOW' ? { background: 'var(--primary-bg)' } : {}}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>0 – 25</td>
                        <td><span className="risk-badge LOW">LOW</span></td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Cleared for travel</td>
                      </tr>
                      <tr style={results.risk.risk_level === 'MODERATE' ? { background: 'var(--primary-bg)' } : {}}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>26 – 50</td>
                        <td><span className="risk-badge MODERATE">MODERATE</span></td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Health advisory issued</td>
                      </tr>
                      <tr style={results.risk.risk_level === 'HIGH' ? { background: 'var(--primary-bg)' } : {}}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>51 – 75</td>
                        <td><span className="risk-badge HIGH">HIGH</span></td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Medical clearance required</td>
                      </tr>
                      <tr style={results.risk.risk_level === 'CRITICAL' ? { background: 'var(--primary-bg)' } : {}}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>76 – 100</td>
                        <td><span className="risk-badge CRITICAL">CRITICAL</span></td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Immediate attention needed</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* New Upload */}
          <button
            className="auth-submit"
            style={{ marginTop: 16, width: 200, display: 'block', marginLeft: 'auto', marginRight: 'auto', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
            onClick={() => { setJobId(null); setResults(null); setFile(null); setPipelineStatus(null); }}
          >
            Upload Another Report
          </button>
        </div>
      )}

      {results && results.status === 'error' && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-body">
            <div className="auth-error">Pipeline failed: {results.error}</div>
            <button
              className="auth-submit"
              style={{ marginTop: 12 }}
              onClick={() => { setJobId(null); setResults(null); setFile(null); setPipelineStatus(null); }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
