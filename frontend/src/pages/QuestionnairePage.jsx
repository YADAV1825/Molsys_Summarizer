import React, { useState, useRef, useEffect } from 'react';
import { FiSend } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API = 'http://localhost:8000';

export default function QuestionnairePage({ token }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [riskResult, setRiskResult] = useState(null);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const startQuestionnaire = async () => {
    setStarted(true);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/questionnaire/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMessages([{ role: 'assistant', content: data.message }]);
    } catch {
      setMessages([{ role: 'assistant', content: 'Failed to start questionnaire. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const sendResponse = async () => {
    if (!input.trim() || loading) return;

    const userMsg = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/questionnaire/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: input.trim(),
          chat_history: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.message }]);

      if (data.complete) {
        setComplete(true);
        setRiskResult(data.risk);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: Failed to process response.' }]);
    } finally {
      setLoading(false);
    }
  };

  if (!started) {
    return (
      <div className="page-content">
        <div style={{ textAlign: 'center', maxWidth: 500, margin: '80px auto' }}>
          <div style={{ fontSize: '4rem', marginBottom: 20 }}>🏥</div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>Health Screening Questionnaire</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: '0.95rem' }}>
            Our AI will ask you a series of health screening questions to assess your travel readiness.
            This takes about 2-3 minutes.
          </p>
          <button className="auth-submit" onClick={startQuestionnaire} style={{ width: 'auto', padding: '12px 32px' }}>
            Start Questionnaire
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 70px)', padding: 0 }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {messages.map((msg, i) => (
            <div key={i} className={`message-row ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'user' ? '👤' : '🏥'}
              </div>
              <div className="message-content-wrapper">
                <div className="message-role-label">{msg.role === 'user' ? 'You' : 'Health Screener'}</div>
                <div className={`message-bubble ${msg.role === 'user' ? 'user-bubble' : 'assistant-bubble'}`}>
                  {msg.role === 'user' ? (
                    <p className="user-text">{msg.content}</p>
                  ) : (
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="message-row assistant">
              <div className="message-avatar">🏥</div>
              <div className="message-content-wrapper">
                <div className="typing-indicator"><span /><span /><span /></div>
              </div>
            </div>
          )}

          {complete && riskResult && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div className={`risk-score-large ${riskResult.risk_level}`}>
                <span className="risk-score-number">{riskResult.risk_score}</span>
                <span className="risk-score-label">{riskResult.risk_level}</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginTop: 12 }}>
                Your responses have been saved and your risk score has been updated.
              </p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      {!complete && (
        <div style={{ padding: '12px 20px 20px', borderTop: '1px solid var(--border)', maxWidth: 640, margin: '0 auto', width: '100%' }}>
          <div className="chat-input-bar">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendResponse(); }}
              placeholder="Type your answer..."
              disabled={loading}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: '0.9rem', fontFamily: 'inherit', padding: '4px 0' }}
            />
            <button
              className={`send-btn ${input.trim() ? 'active' : ''}`}
              onClick={sendResponse}
              disabled={!input.trim() || loading}
            >
              <FiSend size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
