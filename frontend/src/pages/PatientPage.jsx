import React, { useState, useEffect } from 'react';
import { FiFileText, FiActivity, FiClock, FiClipboard, FiUpload } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API = 'http://localhost:8000';

export default function PatientPage({ token }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [summaryContent, setSummaryContent] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/patient/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { setOverview(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const loadSummary = async (type) => {
    if (summaryContent[type]) return;
    try {
      const res = await fetch(`${API}/api/patient/summary/${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSummaryContent((prev) => ({ ...prev, [type]: data.content }));
      }
    } catch {}
  };

  if (loading) return <div className="page-content"><div className="empty-state"><div className="empty-state-icon">⏳</div><div className="empty-state-text">Loading your records...</div></div></div>;

  const profile = overview?.profile || {};
  const risk = overview?.risk;
  const extraction = overview?.extraction;
  const summaries = overview?.summaries || [];
  const uploads = overview?.uploads || [];
  const timeline = overview?.timeline || [];
  const questionnaire = overview?.questionnaire;

  // Merge conditions from profile + extraction + diagnoses
  const allConditions = [...new Set([
    ...(profile.conditions || []),
    ...(extraction?.conditions || []),
    ...(extraction?.diagnoses || []),
  ])].sort();
  const conditionsCount = allConditions.length;

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">My Health Records</h1>
        <p className="page-subtitle">All your medical data in one place</p>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={`tab ${activeTab === 'extraction' ? 'active' : ''}`} onClick={() => setActiveTab('extraction')}>Extractions</button>
        <button className={`tab ${activeTab === 'summaries' ? 'active' : ''}`} onClick={() => setActiveTab('summaries')}>Summaries</button>
        <button className={`tab ${activeTab === 'risk' ? 'active' : ''}`} onClick={() => setActiveTab('risk')}>Risk Report</button>
        <button className={`tab ${activeTab === 'questionnaire' ? 'active' : ''}`} onClick={() => setActiveTab('questionnaire')}>Questionnaire</button>
        <button className={`tab ${activeTab === 'uploads' ? 'active' : ''}`} onClick={() => setActiveTab('uploads')}>Uploads</button>
        <button className={`tab ${activeTab === 'timeline' ? 'active' : ''}`} onClick={() => setActiveTab('timeline')}>Timeline</button>
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div>
          <div className="stats-grid">
            <div className={`stat-card risk-${(risk?.risk_level || 'none').toLowerCase()}`}>
              <div className="stat-card-label">Risk Level</div>
              <div className="stat-card-value">{risk?.risk_score ?? '--'}</div>
              <div className="stat-card-sub"><span className={`risk-badge ${risk?.risk_level || 'NONE'}`}>{risk?.risk_level || 'NONE'}</span></div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Conditions</div>
              <div className="stat-card-value" style={{ color: 'var(--accent-blue)' }}>{conditionsCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Reports</div>
              <div className="stat-card-value" style={{ color: 'var(--accent-purple)' }}>{uploads.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Summaries</div>
              <div className="stat-card-value" style={{ color: 'var(--accent-cyan)' }}>{summaries.length}</div>
            </div>
          </div>

          {allConditions.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><span className="card-title">Conditions</span></div>
              <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {allConditions.map((c, i) => <span key={i} className="risk-badge HIGH" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>{c}</span>)}
              </div>
            </div>
          )}

          {profile.medications?.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title">Medications</span></div>
              <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {profile.medications.map((m, i) => <span key={i} className="risk-badge LOW" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>{m}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Extractions */}
      {activeTab === 'extraction' && (
        <div className="card">
          <div className="card-header"><span className="card-title"><FiFileText size={16} style={{ marginRight: 8 }} />Master Extraction</span></div>
          <div className="card-body">
            {extraction ? (
              <div className="markdown-body">
                {extraction.patient_name && <p><strong>Patient:</strong> {extraction.patient_name}</p>}
                {extraction.age && <p><strong>Age:</strong> {extraction.age}</p>}
                {extraction.gender && <p><strong>Gender:</strong> {extraction.gender}</p>}
                {['travel_and_exposure', 'real_time_iot_vitals', 'active_symptoms', 'critical_lab_markers', 'underlying_vulnerabilities'].map(section => {
                  const data = extraction[section];
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
            ) : (
              <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No extractions yet</div><div className="empty-state-sub">Upload a medical report to get started</div></div>
            )}
          </div>
        </div>
      )}

      {/* Summaries */}
      {activeTab === 'summaries' && (
        <div>
          {summaries.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">📝</div><div className="empty-state-text">No summaries yet</div></div>
          ) : (
            summaries.map((s, i) => (
              <div key={i} className="card" style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => loadSummary(s.filename.replace('summary_', '').replace('.md', ''))}>
                <div className="card-header">
                  <span className="card-title">{s.filename}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(s.modified_at).toLocaleString()}</span>
                </div>
                {summaryContent[s.filename.replace('summary_', '').replace('.md', '')] && (
                  <div className="card-body markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryContent[s.filename.replace('summary_', '').replace('.md', '')]}</ReactMarkdown>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Risk */}
      {activeTab === 'risk' && (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: 32 }}>
            {risk ? (
              <>
                <div className={`risk-score-large ${risk.risk_level}`}>
                  <span className="risk-score-number">{risk.risk_score}</span>
                  <span className="risk-score-label">{risk.risk_level}</span>
                </div>
                <div style={{ maxWidth: 500, margin: '20px auto', textAlign: 'left' }}>
                  <h3 style={{ marginBottom: 8 }}>Score Breakdown</h3>
                  {risk.breakdown?.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.85rem' }}>{item.factor}</span>
                      <span style={{ fontWeight: 600, color: 'var(--risk-high)' }}>+{item.points}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 700, fontSize: '1rem' }}>
                    <span>Total</span>
                    <span style={{ color: `var(--risk-${risk.risk_level.toLowerCase()})` }}>{risk.risk_score}/100</span>
                  </div>
                </div>

                {/* Risk Legend */}
                <div style={{ maxWidth: 500, margin: '16px auto', textAlign: 'left' }}>
                  <h3 style={{ marginBottom: 8 }}>Score Legend</h3>
                  <table className="data-table" style={{ marginBottom: 0 }}>
                    <thead><tr><th>Score Range</th><th>Level</th><th>Meaning</th></tr></thead>
                    <tbody>
                      <tr style={risk.risk_level === 'LOW' ? { background: 'var(--primary-bg)' } : {}}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>0 – 25</td>
                        <td><span className="risk-badge LOW">LOW</span></td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Cleared for travel</td>
                      </tr>
                      <tr style={risk.risk_level === 'MODERATE' ? { background: 'var(--primary-bg)' } : {}}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>26 – 50</td>
                        <td><span className="risk-badge MODERATE">MODERATE</span></td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Health advisory issued</td>
                      </tr>
                      <tr style={risk.risk_level === 'HIGH' ? { background: 'var(--primary-bg)' } : {}}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>51 – 75</td>
                        <td><span className="risk-badge HIGH">HIGH</span></td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Medical clearance required</td>
                      </tr>
                      <tr style={risk.risk_level === 'CRITICAL' ? { background: 'var(--primary-bg)' } : {}}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>76 – 100</td>
                        <td><span className="risk-badge CRITICAL">CRITICAL</span></td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Immediate attention needed</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {risk.recommendations?.map((r, i) => <span key={i} style={{ fontSize: '0.82rem', background: 'var(--surface)', padding: '6px 14px', borderRadius: 'var(--radius-full)', color: 'var(--text-secondary)' }}>{r}</span>)}
                </div>
              </>
            ) : (
              <div className="empty-state"><div className="empty-state-icon"><FiActivity size={48} /></div><div className="empty-state-text">No risk assessment yet</div></div>
            )}
          </div>
        </div>
      )}

      {/* Questionnaire */}
      {activeTab === 'questionnaire' && (
        <div className="card">
          <div className="card-header"><span className="card-title"><FiClipboard size={16} style={{ marginRight: 8 }} />Questionnaire Responses</span></div>
          <div className="card-body">
            {questionnaire ? (
              <table className="data-table">
                <thead>
                  <tr><th>Assessment Topic</th><th>Status / Value</th></tr>
                </thead>
                <tbody>
                  {Object.entries(questionnaire)
                    .filter(([k]) => k !== 'raw_response' && k !== 'completed_at' && typeof questionnaire[k] === 'object' && questionnaire[k] !== null)
                    .flatMap(([sectionKey, sectionObj]) => Object.entries(sectionObj).map(([k, v]) => ({ topic: k, value: v })))
                    .filter(item => item.value !== null)
                    .map((item, i) => (
                      <tr key={i}>
                        <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>{item.topic.replace(/_/g, ' ')}</td>
                        <td>
                          {item.value === true ? <span className="risk-badge HIGH">Yes</span> : 
                           item.value === false ? <span className="risk-badge LOW">No</span> : 
                           item.value}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state"><div className="empty-state-icon">📝</div><div className="empty-state-text">No questionnaire completed</div></div>
            )}
          </div>
        </div>
      )}

      {/* Uploads */}
      {activeTab === 'uploads' && (
        <div className="card">
          <div className="card-header"><span className="card-title"><FiUpload size={16} style={{ marginRight: 8 }} />Uploaded Reports</span></div>
          <div className="card-body">
            {uploads.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">📁</div><div className="empty-state-text">No uploads yet</div></div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Filename</th><th>Size</th><th>Uploaded</th></tr></thead>
                <tbody>
                  {uploads.map((u, i) => (
                    <tr key={i}>
                      <td>{u.original_filename}</td>
                      <td>{(u.size_bytes / 1024 / 1024).toFixed(1)} MB</td>
                      <td>{new Date(u.uploaded_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Timeline */}
      {activeTab === 'timeline' && (
        <div className="card">
          <div className="card-header"><span className="card-title"><FiClock size={16} style={{ marginRight: 8 }} />Health Timeline</span></div>
          <div className="card-body">
            {timeline.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">📅</div><div className="empty-state-text">No events yet</div></div>
            ) : (
              <div className="timeline">
                {[...timeline].reverse().map((event, i) => (
                  <div key={i} className="timeline-item">
                    <div className="timeline-date">{new Date(event.timestamp).toLocaleString()}</div>
                    <div className="timeline-text">{event.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
