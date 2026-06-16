import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FiPlus, FiSearch, FiMessageSquare, FiTrash2, FiEdit2,
  FiX, FiCheck, FiHome, FiUpload, FiClipboard, FiFileText,
  FiShield, FiLogOut,
} from 'react-icons/fi';

export default function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onSearch,
  searchQuery,
  sidebarOpen,
  onCloseSidebar,
  user,
  onLogout,
}) {
  const [editingId, setEditingId] = React.useState(null);
  const [editTitle, setEditTitle] = React.useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const startRename = (e, chat) => {
    e.stopPropagation();
    setEditingId(chat.id);
    setEditTitle(chat.title);
  };

  const confirmRename = (e, chatId) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      onRenameChat(chatId, editTitle.trim());
    }
    setEditingId(null);
  };

  const cancelRename = (e) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const isActive = (path) => location.pathname === path;

  return (
    <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
      <div className="sidebar-header">
        <span className="sidebar-logo">Molsys AI</span>
        <button className="sidebar-close-btn" onClick={onCloseSidebar} title="Close sidebar">
          <FiX size={18} />
        </button>
      </div>

      {/* Navigation */}
      <div className="nav-links">
        <button className={`nav-link ${isActive('/') ? 'active' : ''}`} onClick={() => navigate('/')}>
          <FiHome size={16} className="nav-link-icon" />
          <span>Dashboard</span>
        </button>
        <button className={`nav-link ${isActive('/upload') ? 'active' : ''}`} onClick={() => navigate('/upload')}>
          <FiUpload size={16} className="nav-link-icon" />
          <span>Upload Report</span>
        </button>
        <button className={`nav-link ${isActive('/questionnaire') ? 'active' : ''}`} onClick={() => navigate('/questionnaire')}>
          <FiClipboard size={16} className="nav-link-icon" />
          <span>Questionnaire</span>
        </button>
        <button className={`nav-link ${isActive('/patient') ? 'active' : ''}`} onClick={() => navigate('/patient')}>
          <FiFileText size={16} className="nav-link-icon" />
          <span>My Records</span>
        </button>
        {user?.role === 'admin' && (
          <button className={`nav-link ${isActive('/admin') ? 'active' : ''}`} onClick={() => navigate('/admin')}>
            <FiShield size={16} className="nav-link-icon" />
            <span>Admin Panel</span>
            <span className="nav-badge">⚡</span>
          </button>
        )}
      </div>

      {/* Chat Section */}
      <button className="new-chat-btn" onClick={() => { onNewChat(); navigate('/chat'); }}>
        <FiPlus size={16} />
        <span>New Chat</span>
      </button>

      <div className="search-box">
        <FiSearch size={14} className="search-icon" />
        <input
          type="text"
          placeholder="Search chats..."
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="chat-list">
        <div className="chat-list-label">Recent Chats</div>
        {chats.length === 0 && (
          <div className="empty-chats">No conversations yet</div>
        )}
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
            onClick={() => { onSelectChat(chat.id); navigate('/chat'); }}
          >
            <FiMessageSquare size={14} className="chat-item-icon" />
            {editingId === chat.id ? (
              <div className="rename-input-wrapper" onClick={(e) => e.stopPropagation()}>
                <input
                  className="rename-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename(e, chat.id);
                    if (e.key === 'Escape') cancelRename(e);
                  }}
                  autoFocus
                />
                <button className="rename-action-btn" onClick={(e) => confirmRename(e, chat.id)}>
                  <FiCheck size={12} />
                </button>
              </div>
            ) : (
              <>
                <span className="chat-item-title">{chat.title}</span>
                <div className="chat-item-actions">
                  <button onClick={(e) => startRename(e, chat)} title="Rename">
                    <FiEdit2 size={12} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }} title="Delete">
                    <FiTrash2 size={12} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* User Profile */}
      <div className="sidebar-footer">
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {(user.full_name || user.username).charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user.full_name || user.username}</div>
              <div className="sidebar-user-role">{user.role}</div>
            </div>
            <button className="sidebar-logout" onClick={onLogout} title="Logout">
              <FiLogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
