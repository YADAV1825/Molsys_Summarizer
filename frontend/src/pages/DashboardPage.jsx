import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUpload, FiMessageSquare, FiClipboard, FiActivity, FiFileText, FiClock, FiInfo } from 'react-icons/fi';

const API = 'http://localhost:8000';

const RISK_LEGEND = [
  { range: '0 – 25', level: 'LOW', color: 'var(--risk-low)', desc: 'Cleared for travel' },
  { range: '26 – 50', level: 'MODERATE', color: 'var(--risk-moderate)', desc: 'Health advisory issued' },
  { range: '51 – 75', level: 'HIGH', color: 'var(--risk-high)', desc: 'Medical clearance required' },
  { range: '76 – 100', level: 'CRITICAL', color: 'var(--risk-critical)', desc: 'Immediate attention needed' },
];

export default function DashboardPage({ token }) {
  const [overview, setOverview] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API}/api/patient/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setOverview)
      .catch(() => {});
  }, [token]);

  const risk = overview?.risk;
  const profile = overview?.profile;
  const extraction = overview?.extraction;
  const timeline = overview?.timeline || [];

  const riskLevel = risk?.risk_level || 'NONE';
  const riskScore = risk?.risk_score ?? '--';

  // Conditions: merge from profile + extraction to avoid showing 0 when data exists
  const conditionsFromProfile = profile?.conditions || [];
  const conditionsFromExtraction = extraction?.conditions || [];
  const conditionsFromDiagnoses = extraction?.diagnoses || [];
  const allConditions = [...new Set([...conditionsFromProfile, ...conditionsFromExtraction, ...conditionsFromDiagnoses])].sort();
  const conditionsCount = allConditions.length;

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">Welcome back{profile?.patient_name ? `, ${profile.patient_name}` : ''}</h1>
        <p className="page-subtitle">Your health intelligence dashboard</p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className={`stat-card risk-${riskLevel.toLowerCase()}`}>
          <div className="stat-card-label">Risk Score</div>
          <div className="stat-card-value">{riskScore}</div>
          <div className="stat-card-sub">
            <span className={`risk-badge ${riskLevel}`}>{riskLevel}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Conditions</div>
          <div className="stat-card-value" style={{ color: 'var(--accent-blue)' }}>
            {conditionsCount}
          </div>
          <div className="stat-card-sub">Identified conditions</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Uploads</div>
          <div className="stat-card-value" style={{ color: 'var(--accent-purple)' }}>
            {overview?.uploads?.length || 0}
          </div>
          <div className="stat-card-sub">Medical reports</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Medications</div>
          <div className="stat-card-value" style={{ color: 'var(--accent-cyan)' }}>
            {profile?.medications?.length || 0}
          </div>
          <div className="stat-card-sub">Current medications</div>
        </div>
      </div>

      {/* Risk Score Legend */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title"><FiInfo size={16} style={{ marginRight: 8 }} />Risk Score Guide</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data-table" style={{ marginBottom: 0 }}>
            <thead>
              <tr>
                <th>Score Range</th>
                <th>Level</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {RISK_LEGEND.map((r) => (
                <tr key={r.level} style={riskLevel === r.level ? { background: 'var(--primary-bg)' } : {}}>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{r.range}</td>
                  <td><span className={`risk-badge ${r.level}`}>{r.level}</span></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>Quick Actions</h2>
      <div className="action-grid">
        <div className="action-card" onClick={() => navigate('/upload')}>
          <div className="action-card-icon green"><FiUpload size={22} /></div>
          <div className="action-card-text">
            <h3>Upload Report</h3>
            <p>Upload a medical PDF for analysis</p>
          </div>
        </div>
        <div className="action-card" onClick={() => navigate('/questionnaire')}>
          <div className="action-card-icon blue"><FiClipboard size={22} /></div>
          <div className="action-card-text">
            <h3>Health Questionnaire</h3>
            <p>AI-guided health screening</p>
          </div>
        </div>
        <div className="action-card" onClick={() => navigate('/chat')}>
          <div className="action-card-icon purple"><FiMessageSquare size={22} /></div>
          <div className="action-card-text">
            <h3>Chat with AI</h3>
            <p>Ask medical questions</p>
          </div>
        </div>
        <div className="action-card" onClick={() => navigate('/patient')}>
          <div className="action-card-icon cyan"><FiFileText size={22} /></div>
          <div className="action-card-text">
            <h3>My Records</h3>
            <p>View extractions & summaries</p>
          </div>
        </div>
      </div>

      {/* Conditions */}
      {allConditions.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title"><FiActivity size={16} style={{ marginRight: 8 }} />Current Conditions</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {allConditions.map((c, i) => (
              <span key={i} className="risk-badge MODERATE" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title"><FiClock size={16} style={{ marginRight: 8 }} />Recent Activity</span>
          </div>
          <div className="card-body">
            <div className="timeline">
              {timeline.slice(-5).reverse().map((event, i) => (
                <div key={i} className="timeline-item">
                  <div className="timeline-date">
                    {new Date(event.timestamp).toLocaleString()}
                  </div>
                  <div className="timeline-text">{event.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
