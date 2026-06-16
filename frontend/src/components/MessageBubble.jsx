import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { FiCopy, FiRefreshCw, FiEdit2, FiCheck, FiX, FiUser, FiCpu, FiFileText } from 'react-icons/fi';

export default function MessageBubble({ msg, index, onCopy, onRegenerate, onEdit }) {
  const [copied, setCopied] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editContent, setEditContent] = React.useState(msg.content);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (onCopy) onCopy(msg.content);
  };

  const handleEdit = () => {
    setEditing(true);
    setEditContent(msg.content);
  };

  const handleEditConfirm = () => {
    setEditing(false);
    if (onEdit) onEdit(index, editContent);
  };

  const handleEditCancel = () => {
    setEditing(false);
    setEditContent(msg.content);
  };

  const isUser = msg.role === 'user';

  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">
        {isUser ? <FiUser size={16} /> : <FiCpu size={16} />}
      </div>
      <div className="message-content-wrapper">
        <div className="message-role-label">
          {isUser ? 'You' : (msg.model || 'Assistant')}
        </div>
        {msg.attachment && (
          <div className="attached-file-pill" style={{ pointerEvents: 'none', marginBottom: '8px', cursor: 'default' }}>
            <div className="file-pill-icon-container">
              <FiFileText color="white" size={16} />
            </div>
            <div className="file-pill-details">
              <span className="file-pill-name" title={msg.attachment.name || msg.attachment.filename}>
                {msg.attachment.name || msg.attachment.filename}
              </span>
              <span className="file-pill-type">PDF</span>
            </div>
          </div>
        )}
        {editing ? (
          <div className="edit-area">
            <textarea
              className="edit-textarea"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className="edit-actions">
              <button className="edit-action-btn confirm" onClick={handleEditConfirm}>
                <FiCheck size={14} /> Save & Submit
              </button>
              <button className="edit-action-btn cancel" onClick={handleEditCancel}>
                <FiX size={14} /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
            {isUser ? (
              <p className="user-text">{msg.content}</p>
            ) : (
              <div className="markdown-body">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight, rehypeRaw]}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}
        {!editing && (
          <div className="message-actions">
            <button onClick={handleCopy} title={copied ? 'Copied!' : 'Copy'}>
              {copied ? <FiCheck size={13} /> : <FiCopy size={13} />}
            </button>
            {isUser && onEdit && (
              <button onClick={handleEdit} title="Edit">
                <FiEdit2 size={13} />
              </button>
            )}
            {!isUser && onRegenerate && (
              <button onClick={() => onRegenerate()} title="Regenerate">
                <FiRefreshCw size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
