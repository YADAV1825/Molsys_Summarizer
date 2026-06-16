import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Sidebar from './components/Sidebar';
import WelcomeScreen from './components/WelcomeScreen';
import ChatArea from './components/ChatArea';
import ChatInput from './components/ChatInput';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import PatientPage from './pages/PatientPage';
import QuestionnairePage from './pages/QuestionnairePage';
import AdminPage from './pages/AdminPage';
import { FiMenu, FiDownload } from 'react-icons/fi';
import './index.css';

const API = 'http://localhost:8000';

function AppInner() {
  // Auth State
  const [token, setToken] = useState(() => localStorage.getItem('molsys_token'));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('molsys_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Chat State
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [model, setModel] = useState(() => localStorage.getItem('molsys_model') || 'gemini-3-flash-lite');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mode, setMode] = useState('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [attachedFile, setAttachedFile] = useState(null);
  const [attachedFileId, setAttachedFileId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const navigate = useNavigate();
  const location = useLocation();

  // Auth handlers
  const handleLogin = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('molsys_token', newToken);
    localStorage.setItem('molsys_user', JSON.stringify(newUser));
  };

  const handleLogout = () => {
    if (token) {
      fetch(`${API}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('molsys_token');
    localStorage.removeItem('molsys_user');
    navigate('/login');
  };

  // Validate token on mount
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error('Invalid token');
        return r.json();
      })
      .then((data) => {
        setUser(data);
        localStorage.setItem('molsys_user', JSON.stringify(data));
      })
      .catch(() => {
        handleLogout();
      });
  }, []);

  // Persist model
  useEffect(() => {
    localStorage.setItem('molsys_model', model);
  }, [model]);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // Load chats
  const loadChats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/api/chats`, { headers: authHeaders });
      setChats(res.data);
    } catch {
      setChats([]);
    }
  }, [token, searchQuery]);

  useEffect(() => { loadChats(); }, [loadChats]);

  // Load active chat
  const loadChat = useCallback(async (chatId) => {
    if (!chatId || !token) { setMessages([]); return; }
    try {
      const res = await axios.get(`${API}/api/chat/${chatId}`, { headers: authHeaders });
      setMessages(res.data.messages || []);
      setModel(res.data.model || 'gemini-3-flash-lite');
    } catch {
      setMessages([]);
    }
  }, [token]);

  useEffect(() => { loadChat(activeChatId); }, [activeChatId, loadChat]);

  // ── Chat Actions ──

  const handleNewChat = () => {
    if (!activeChatId && messages.length === 0) return;
    setActiveChatId(null);
    setMessages([]);
    setAttachedFile(null);
    setAttachedFileId(null);
    setUploadProgress(0);
  };

  const handleSelectChat = (chatId) => {
    setActiveChatId(chatId);
    setAttachedFile(null);
    setAttachedFileId(null);
    setUploadProgress(0);
  };

  const handleDeleteChat = async (chatId) => {
    try {
      await axios.delete(`${API}/api/chat/${chatId}`, { headers: authHeaders });
      if (activeChatId === chatId) { setActiveChatId(null); setMessages([]); }
      loadChats();
    } catch {}
  };

  const handleRenameChat = async (chatId, newTitle) => {
    try {
      await axios.put(`${API}/api/chat/${chatId}/rename`, { title: newTitle }, { headers: authHeaders });
      loadChats();
    } catch {}
  };

  const handleSend = async (text) => {
    if (!text.trim()) return;
    let chatId = activeChatId;
    setIsLoading(true);

    if (!chatId) {
      try {
        const res = await axios.post(`${API}/api/chat/new`, { title: text.slice(0, 50), model }, { headers: authHeaders });
        chatId = res.data.id;
        setActiveChatId(chatId);
      } catch { setIsLoading(false); return; }
    }

    // Handle file upload
    if (attachedFile && !attachedFileId) {
      try {
        const formData = new FormData();
        formData.append('file', attachedFile);
        const uploadRes = await axios.post(`${API}/api/upload`, formData, {
          headers: { ...authHeaders },
          onUploadProgress: (p) => setUploadProgress(Math.round((p.loaded * 100) / p.total)),
        });
        const fileId = uploadRes.data.file_id;
        setAttachedFileId(fileId);
        await axios.post(`${API}/api/chat/${chatId}/attach`, new URLSearchParams({ file_id: fileId }), { headers: authHeaders });
      } catch {}
    } else if (attachedFileId) {
      try { await axios.post(`${API}/api/chat/${chatId}/attach`, new URLSearchParams({ file_id: attachedFileId }), { headers: authHeaders }); } catch {}
    }

    const currentAttachment = attachedFile ? { name: attachedFile.name, id: attachedFileId } : null;
    const userMsg = { role: 'user', content: text, attachment: currentAttachment };
    setMessages((prev) => [...prev, userMsg]);
    setAttachedFile(null);
    setAttachedFileId(null);
    setUploadProgress(0);

    try {
      const res = await axios.post(`${API}/api/chat`, {
        chat_id: chatId, content: text, model, attachment: currentAttachment, mode,
      }, { headers: authHeaders });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.content, model: res.data.model }]);
      loadChats();
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: Failed to get response.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!activeChatId) return;
    setIsLoading(true);
    setMessages((prev) => prev.length && prev[prev.length - 1].role === 'assistant' ? prev.slice(0, -1) : prev);
    try {
      const res = await axios.post(`${API}/api/chat/${activeChatId}/regenerate?model=${model}`, {}, { headers: authHeaders });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.content, model: res.data.model }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: Failed to regenerate.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = async (msgIndex, newContent) => {
    if (!activeChatId) return;
    setIsLoading(true);
    setMessages((prev) => {
      const updated = [...prev];
      updated[msgIndex] = { ...updated[msgIndex], content: newContent };
      return updated.slice(0, msgIndex + 1);
    });
    try {
      const res = await axios.post(`${API}/api/chat/${activeChatId}/edit`, {
        msg_index: msgIndex, content: newContent, model,
      }, { headers: authHeaders });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.content, model: res.data.model }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: Failed to regenerate after edit.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (activeChatId) window.open(`${API}/api/chat/${activeChatId}/export`, '_blank');
  };

  const hasMessages = messages.length > 0;
  const isChatPage = location.pathname === '/chat';
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  // Redirect if not logged in
  if (!token && !isAuthPage) {
    return <Navigate to="/login" replace />;
  }

  // Auth pages (no sidebar)
  if (isAuthPage) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
        <Route path="/register" element={<RegisterPage onLogin={handleLogin} />} />
      </Routes>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        onSearch={setSearchQuery}
        searchQuery={searchQuery}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        user={user}
        onLogout={handleLogout}
      />

      <main className="main-area">
        <header className="top-bar">
          <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <FiMenu size={20} />
          </button>

          <span className="top-bar-title">
            {location.pathname === '/' && 'Dashboard'}
            {location.pathname === '/chat' && (activeChatId ? 'Chat' : 'New Chat')}
            {location.pathname === '/upload' && 'Upload Report'}
            {location.pathname === '/questionnaire' && 'Health Questionnaire'}
            {location.pathname === '/patient' && 'My Records'}
            {location.pathname === '/admin' && 'Admin Dashboard'}
          </span>

          <div className="header-actions">
            {isChatPage && activeChatId && (
              <button className="export-btn" onClick={handleExport} title="Export as Markdown">
                <FiDownload size={16} />
                <span>Export</span>
              </button>
            )}
          </div>
        </header>

        <Routes>
          <Route path="/" element={<DashboardPage token={token} />} />
          <Route path="/upload" element={<UploadPage token={token} />} />
          <Route path="/questionnaire" element={<QuestionnairePage token={token} />} />
          <Route path="/patient" element={<PatientPage token={token} />} />
          <Route path="/admin" element={
            user?.role === 'admin'
              ? <AdminPage token={token} />
              : <Navigate to="/" replace />
          } />
          <Route path="/chat" element={
            <>
              {!hasMessages ? (
                <WelcomeScreen
                  onSuggestionClick={(text) => handleSend(text)}
                  model={model}
                  onModelChange={setModel}
                />
              ) : (
                <ChatArea
                  messages={messages}
                  isLoading={isLoading}
                  onRegenerate={handleRegenerate}
                  onEdit={handleEdit}
                />
              )}
              <div className="disclaimer">
                AI can make mistakes — please review. We don't guarantee output accuracy.
              </div>
              <ChatInput
                onSend={handleSend}
                disabled={isLoading}
                attachedFile={attachedFile}
                onAttachFile={(f) => { setAttachedFile(f); setAttachedFileId(null); setUploadProgress(0); }}
                onRemoveFile={() => { setAttachedFile(null); setAttachedFileId(null); setUploadProgress(0); }}
                uploadProgress={uploadProgress}
                model={model}
                onModelChange={setModel}
                mode={mode}
                onModeChange={setMode}
              />
            </>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
