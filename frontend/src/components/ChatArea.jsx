import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';

export default function ChatArea({ messages, isLoading, onCopy, onRegenerate, onEdit }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const lastUserIndex = messages.findLastIndex?.(m => m.role === 'user') ?? 
                        messages.map(m => m.role).lastIndexOf('user');

  return (
    <div className="chat-area">
      <div className="messages-container">
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            index={i}
            onCopy={onCopy}
            onRegenerate={i === messages.length - 1 && msg.role === 'assistant' ? onRegenerate : null}
            onEdit={i === lastUserIndex ? onEdit : null}
          />
        ))}
        {isLoading && (
          <div className="message-row assistant">
            <div className="message-avatar">
              <span className="typing-icon">⚡</span>
            </div>
            <div className="message-content-wrapper">
              <div className="message-role-label">Thinking...</div>
              <div className="message-bubble assistant-bubble">
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
