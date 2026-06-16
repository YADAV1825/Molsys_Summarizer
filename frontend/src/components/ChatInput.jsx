import React, { useRef, useEffect } from 'react';
import { FiSend, FiPaperclip, FiX, FiFileText, FiDatabase, FiMessageSquare } from 'react-icons/fi';
import ModelSelector from './ModelSelector';

export default function ChatInput({ onSend, disabled, attachedFile, onAttachFile, onRemoveFile, uploadProgress, model, onModelChange, mode, onModeChange }) {
  const [text, setText] = React.useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [text]);

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onAttachFile(file);
    }
    e.target.value = '';
  };

  return (
    <div className="chat-input-container">
      {attachedFile && (
        <div className="attached-file-pill">
          <div className="file-pill-icon-container">
            {uploadProgress > 0 && uploadProgress < 100 ? (
              <svg className="progress-ring" width="24" height="24">
                <circle className="progress-ring__circle" stroke="white" strokeWidth="2" fill="transparent" r="10" cx="12" cy="12"
                  style={{ 
                    strokeDasharray: `${10 * 2 * Math.PI}`, 
                    strokeDashoffset: `${((100 - uploadProgress) / 100) * (10 * 2 * Math.PI)}` 
                  }} 
                />
              </svg>
            ) : (
              <FiFileText color="white" size={16} />
            )}
          </div>
          <div className="file-pill-details">
            <span className="file-pill-name" title={attachedFile.name || attachedFile.filename}>
              {attachedFile.name || attachedFile.filename}
            </span>
            <span className="file-pill-type">PDF</span>
          </div>
          <button className="file-pill-remove" onClick={onRemoveFile}>
            <FiX size={14} />
          </button>
        </div>
      )}
      <div className="chat-input-bar">
        <button className="attach-btn" onClick={handleFileClick} title="Upload PDF" disabled={disabled}>
          <FiPaperclip size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder="Ask anything..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
        />
        <div className="input-right-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className={`mode-toggle-btn ${mode === 'extract' ? 'active' : ''}`}
            onClick={() => onModeChange(mode === 'extract' ? 'chat' : 'extract')}
            title={mode === 'extract' ? 'JSON Extraction Mode' : 'Standard Chat Mode'}
            style={{
              background: mode === 'extract' ? 'var(--primary-bg)' : 'transparent',
              color: mode === 'extract' ? 'var(--primary)' : 'var(--text-muted)',
              border: `1px solid ${mode === 'extract' ? 'var(--primary)' : 'var(--border)'}`,
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 500,
              transition: 'all 0.2s ease'
            }}
          >
            {mode === 'extract' ? <FiDatabase size={14} /> : <FiMessageSquare size={14} />}
            {mode === 'extract' ? 'Extract' : 'Chat'}
          </button>
          <ModelSelector model={model} onChange={onModelChange} />
          <button
            className={`send-btn ${text.trim() ? 'active' : ''}`}
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            title="Send"
          >
            <FiSend size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
