import React, { useState, useEffect } from 'react';
import { FiUsers, FiAlertTriangle, FiAlertCircle, FiShield, FiCheckCircle, FiSearch, FiInfo, FiArrowLeft, FiFileText, FiClipboard, FiUpload, FiClock, FiActivity } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API = 'http://localhost:8000';

const RISK_LEGEND = [
  { range: '0 – 25', level: 'LOW', color: 'var(--risk-low)', desc: 'Cleared for travel' },
  { range: '26 – 50', level: 'MODERATE', color: 'var(--risk-moderate)', desc: 'Health advisory issued' },
  { range: '51 – 75', level: 'HIGH', color: 'var(--risk-high)', desc: 'Medical clearance required' },
  { range: '76 – 100', level: 'CRITICAL', color: 'var(--risk-critical)', desc: 'Immediate attention needed' },
];

export default function AdminPage({ token }) {
  const [stats, setStats] = useState(null);
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientDetail, setPatientDetail] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [summaryContents, setSummaryContents] = useState({});

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${API}/api/admin/stats`, { headers }).then((r) => r.json()).then(setStats).catch(() => {});
    fetch(`${API}/api/admin/patients`, { headers }).then((r) => r.json()).then(setPatients).catch(() => {});
  }, [token]);

  const loadPatientDetail = async (username) => {
    setSelectedPatient(username);
    setActiveTab('overview');
    setSummaryContents({});
    try {
      const res = await fetch(`${API}/api/admin/patient/${username}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPatientDetail(await res.json());
    } catch {}
  };

  const loadSummaryContent = async (username, filename) => {
    const key = filename.replace('summary_', '').replace('.md', '');
    if (summaryContents[key]) return;
    try {
      // Read the summary content from the admin patient endpoint
      // The overview already has summaries list, but we need the content
      // Use the main patient summary endpoint with admin override
      const res = await fetch(`${API}/api/admin/patient/${username}/summary/${key}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSummaryContents((prev) => ({ ...prev, [key]: data.content }));
      }
    } catch {}
  };

  const filtered = patients.filter((p) =>
    p.username.toLowerCase().includes(search.toLowerCase()) ||
    p.full_name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Patient Detail View ──
  if (selectedPatient && patientDetail) {
    const profile = patientDetail.profile || {};
    const risk = patientDetail.risk;
    const extraction = patientDetail.extraction;
    const summaries = patientDetail.summaries || [];
    const uploads = patientDetail.uploads || [];
    const timeline = patientDetail.timeline || [];
    const questionnaire = patientDetail.questionnaire;

    // Merge conditions from profile + extraction + diagnoses
    const allConditions = [...new Set([
      ...(profile.conditions || []),
      ...(extraction?.conditions || []),
      ...(extraction?.diagnoses || []),
    ])].sort();

    return (
      <div className="page-content">
        <button
          onClick={() => { setSelectedPatient(null); setPatientDetail(null); }}
          style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <FiArrowLeft size={14} /> Back to all patients
        </button>

        <div className="page-header">
          <h1 className="page-title">{profile.patient_name || selectedPatient}</h1>
          <p className="page-subtitle">Patient Details — @{selectedPatient}{profile.age ? ` • Age: ${profile.age}` : ''}{profile.gender ? ` • ${profile.gender}` : ''}</p>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className={`stat-card risk-${(risk?.risk_level || 'none').toLowerCase()}`}>
            <div className="stat-card-label">Risk Score</div>
            <div className="stat-card-value">{risk?.risk_score ?? '--'}</div>
            <div className="stat-card-sub"><span className={`risk-badge ${risk?.risk_level || 'NONE'}`}>{risk?.risk_level || 'NONE'}</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Conditions</div>
            <div className="stat-card-value" style={{ color: 'var(--accent-blue)' }}>{allConditions.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Uploads</div>
            <div className="stat-card-value" style={{ color: 'var(--accent-purple)' }}>{uploads.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Medications</div>
            <div className="stat-card-value" style={{ color: 'var(--accent-cyan)' }}>{profile.medications?.length || extraction?.medications?.length || 0}</div>
          </div>
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

        {/* ── Overview Tab ── */}
        {activeTab === 'overview' && (
          <div>
            {allConditions.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header"><span className="card-title"><FiActivity size={16} style={{ marginRight: 8 }} />Conditions</span></div>
                <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {allConditions.map((c, i) => <span key={i} className="risk-badge HIGH" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>{c}</span>)}
                </div>
              </div>
            )}

            {(profile.medications?.length > 0 || extraction?.medications?.length > 0) && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header"><span className="card-title">Medications</span></div>
                <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[...new Set([...(profile.medications || []), ...(extraction?.medications || [])])].map((m, i) => (
                    <span key={i} className="risk-badge LOW" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>{m}</span>
                  ))}
                </div>
              </div>
            )}

            {risk?.recommendations?.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header"><span className="card-title">Recommendations</span></div>
                <div className="card-body">
                  <ul style={{ paddingLeft: 20, margin: 0 }}>
                    {risk.recommendations.map((r, i) => <li key={i} style={{ marginBottom: 4, fontSize: '0.9rem' }}>{r}</li>)}
                  </ul>
                </div>
              </div>
            )}

            {/* Risk Legend */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><span className="card-title"><FiInfo size={16} style={{ marginRight: 8 }} />Risk Score Guide</span></div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="data-table" style={{ marginBottom: 0 }}>
                  <thead><tr><th>Score Range</th><th>Level</th><th>Meaning</th></tr></thead>
                  <tbody>
                    {RISK_LEGEND.map((r) => (
                      <tr key={r.level} style={risk?.risk_level === r.level ? { background: 'var(--primary-bg)' } : {}}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{r.range}</td>
                        <td><span className={`risk-badge ${r.level}`}>{r.level}</span></td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{r.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Extraction Tab ── */}
        {activeTab === 'extraction' && (
          <div className="card">
            <div className="card-header"><span className="card-title"><FiFileText size={16} style={{ marginRight: 8 }} />Medical Extraction Data</span></div>
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
                        <h3 style={{ textTransform: 'capitalize', marginTop: 16 }}>{String(section).replace(/_/g, ' ')}</h3>
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
                  <p style={{ color: 'var(--text-muted)', marginTop: 16, fontSize: '0.8rem' }}>Last updated: {extraction.last_updated || '—'}</p>
                </div>
              ) : (
                <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No extraction data available</div></div>
              )}
            </div>
          </div>
        )}

        {/* ── Summaries Tab ── */}
        {activeTab === 'summaries' && (
          <div>
            {summaries.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">📝</div><div className="empty-state-text">No summaries generated yet</div></div>
            ) : (
              summaries.map((s, i) => {
                const key = s.filename.replace('summary_', '').replace('.md', '');
                return (
                  <div key={i} className="card" style={{ marginBottom: 12 }}>
                    <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => loadSummaryContent(selectedPatient, s.filename)}>
                      <span className="card-title">{s.filename.replace('summary_', '').replace('.md', '').replace(/_/g, ' ').toUpperCase()} Summary</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(s.modified_at).toLocaleString()} • Click to load</span>
                    </div>
                    {summaryContents[key] && (
                      <div className="card-body markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryContents[key]}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Risk Tab ── */}
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
                    <h3 style={{ marginBottom: 12 }}>Score Breakdown</h3>
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
                  <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                    {risk.recommendations?.map((r, i) => <span key={i} style={{ fontSize: '0.82rem', background: 'var(--surface)', padding: '6px 14px', borderRadius: 'var(--radius-full)', color: 'var(--text-secondary)' }}>{r}</span>)}
                  </div>
                </>
              ) : (
                <div className="empty-state"><div className="empty-state-icon"><FiActivity size={48} /></div><div className="empty-state-text">No risk assessment available</div></div>
              )}
            </div>
          </div>
        )}

        {/* ── Questionnaire Tab ── */}
        {activeTab === 'questionnaire' && (
          <div className="card">
            <div className="card-header"><span className="card-title"><FiClipboard size={16} style={{ marginRight: 8 }} />Questionnaire Responses</span></div>
            <div className="card-body">
              {questionnaire ? (
                <div>
                  {questionnaire.raw_response && (
                    <div className="markdown-body" style={{ marginBottom: 16 }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{questionnaire.raw_response}</ReactMarkdown>
                    </div>
                  )}
                  <h4 style={{ marginBottom: 8 }}>Parsed Data</h4>
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
                  {questionnaire.completed_at && (
                    <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: '0.8rem' }}>Completed: {new Date(questionnaire.completed_at).toLocaleString()}</p>
                  )}
                </div>
              ) : (
                <div className="empty-state"><div className="empty-state-icon">📝</div><div className="empty-state-text">No questionnaire completed</div></div>
              )}
            </div>
          </div>
        )}

        {/* ── Uploads Tab ── */}
        {activeTab === 'uploads' && (
          <div className="card">
            <div className="card-header"><span className="card-title"><FiUpload size={16} style={{ marginRight: 8 }} />Uploaded Reports</span></div>
            <div className="card-body">
              {uploads.length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">📁</div><div className="empty-state-text">No uploads yet</div></div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Filename</th><th>File ID</th><th>Size</th><th>Uploaded</th></tr></thead>
                  <tbody>
                    {uploads.map((u, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{u.original_filename}</td>
                        <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{u.file_id?.slice(0, 8)}...</td>
                        <td>{(u.size_bytes / 1024).toFixed(0)} KB</td>
                        <td>{new Date(u.uploaded_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Timeline Tab ── */}
        {activeTab === 'timeline' && (
          <div className="card">
            <div className="card-header"><span className="card-title"><FiClock size={16} style={{ marginRight: 8 }} />Patient Timeline</span></div>
            <div className="card-body">
              {timeline.length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">📅</div><div className="empty-state-text">No events yet</div></div>
              ) : (
                <div className="timeline">
                  {[...timeline].reverse().map((e, i) => (
                    <div key={i} className="timeline-item">
                      <div className="timeline-date">{new Date(e.timestamp).toLocaleString()}</div>
                      <div className="timeline-text">{e.description}</div>
                      {e.metadata && (
                        <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {e.metadata.risk_level && <span className={`risk-badge ${e.metadata.risk_level}`} style={{ marginRight: 8 }}>{e.metadata.risk_level}</span>}
                          {e.metadata.model_used && <span>Model: {e.metadata.model_used}</span>}
                        </div>
                      )}
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

  // ── Patient List View ──
  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-subtitle">Monitor all patients and risk levels</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-label"><FiUsers size={14} style={{ marginRight: 4 }} /> Total Patients</div>
            <div className="stat-card-value" style={{ color: 'var(--accent-blue)' }}>{stats.total_patients}</div>
          </div>
          <div className="stat-card risk-critical">
            <div className="stat-card-label"><FiAlertTriangle size={14} style={{ marginRight: 4 }} /> Critical</div>
            <div className="stat-card-value">{stats.critical}</div>
          </div>
          <div className="stat-card risk-high">
            <div className="stat-card-label"><FiAlertCircle size={14} style={{ marginRight: 4 }} /> High Risk</div>
            <div className="stat-card-value">{stats.high}</div>
          </div>
          <div className="stat-card risk-moderate">
            <div className="stat-card-label"><FiShield size={14} style={{ marginRight: 4 }} /> Moderate</div>
            <div className="stat-card-value">{stats.moderate}</div>
          </div>
          <div className="stat-card risk-low">
            <div className="stat-card-label"><FiCheckCircle size={14} style={{ marginRight: 4 }} /> Low</div>
            <div className="stat-card-value">{stats.low}</div>
          </div>
        </div>
      )}

      {/* Risk Legend */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><span className="card-title"><FiInfo size={16} style={{ marginRight: 8 }} />Risk Score Guide</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data-table" style={{ marginBottom: 0 }}>
            <thead><tr><th>Score Range</th><th>Level</th><th>Meaning</th></tr></thead>
            <tbody>
              {RISK_LEGEND.map((r) => (
                <tr key={r.level}>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{r.range}</td>
                  <td><span className={`risk-badge ${r.level}`}>{r.level}</span></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Search */}
      <div className="search-box" style={{ margin: '0 0 16px', maxWidth: 400 }}>
        <FiSearch size={14} className="search-icon" />
        <input
          type="text"
          placeholder="Search patients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Patient Table */}
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Risk Score</th>
              <th>Risk Level</th>
              <th>Conditions</th>
              <th>Uploads</th>
              <th>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No patients found</td></tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.username} onClick={() => loadPatientDetail(p.username)}>
                  <td>
                    <div><strong>{p.full_name}</strong></div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{p.username}</div>
                  </td>
                  <td style={{ fontWeight: 700, color: `var(--risk-${p.risk_level.toLowerCase()})` }}>{p.risk_score}</td>
                  <td><span className={`risk-badge ${p.risk_level}`}>{p.risk_level}</span></td>
                  <td>{p.conditions?.slice(0, 3).join(', ') || '—'}</td>
                  <td>{p.uploads_count}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {p.last_activity ? new Date(p.last_activity).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
