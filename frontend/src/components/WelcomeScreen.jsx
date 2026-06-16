import React from 'react';
import { FiCpu } from 'react-icons/fi';

const API = 'http://localhost:8000';

const suggestions = [
  { icon: '📄', text: 'Analyze my medical report' },
  { icon: '🏥', text: 'What are my risk factors?' },
  { icon: '💊', text: 'Explain my medications' },
  { icon: '✈️', text: 'Am I fit to travel?' },
];

export default function WelcomeScreen({ onSuggestionClick, model, onModelChange }) {
  const [models, setModels] = React.useState([]);

  React.useEffect(() => {
    fetch(`${API}/api/models`)
      .then((res) => res.json())
      .then((data) => setModels(data))
      .catch(() => {});
  }, []);

  // Group models by provider
  const lightningModels = models.filter((m) => m.provider === 'lightning');
  const nvidiaModels = models.filter((m) => m.provider === 'nvidia');

  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <h1 className="welcome-title">
          What can I help you with?
        </h1>
        <p className="welcome-subtitle">
          Ask about your health, upload a PDF, or get medical insights.
        </p>

        <div className="suggestions">
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="suggestion-chip"
              onClick={() => onSuggestionClick(s.text)}
            >
              <span className="suggestion-icon">{s.icon}</span>
              <span>{s.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
