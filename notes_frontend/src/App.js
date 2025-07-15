import React, { useState, useEffect, createContext, useContext } from "react";
import "./App.css";
import "./index.css";

// ---- CONSTANTS ----
const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"; // Or change to deployed FastAPI URL
const LOCAL_KW = "web"; // For local_kw query param for backend (adapt as required)

// ---- CONTEXTS ----
const AuthContext = createContext();
// PUBLIC_INTERFACE
export function useAuth() {
  return useContext(AuthContext);
}

// ---- API CLIENT HELPERS ----
async function backendFetch(url, { method = "GET", token = null, body = null, params = {} } = {}) {
  const search = new URLSearchParams(params).toString();
  const fullUrl =
    url + (url.includes("?") ? "&" : "?") + search + (search ? "" : "");
  let headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(fullUrl, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (resp.status === 204) return {};
  let data;
  try {
    data = await resp.json();
  } catch {
    data = {};
  }
  if (!resp.ok) throw { status: resp.status, message: data.detail || "Error", raw: data };
  return data;
}

// ---- AUTH PROVIDER ----
function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // User object
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [loading, setLoading] = useState(false);

  // Fetch ('me') if token changes
  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    setLoading(true);
    backendFetch(`${API_BASE}/users/me`, {
      token,
      params: { local_kw: LOCAL_KW },
    })
      .then((u) => {
        setUser(u);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setToken("");
        localStorage.removeItem("token");
        setLoading(false);
      });
  }, [token]);

  // PUBLIC_INTERFACE
  async function login({ username, password }) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          username,
          password,
        }),
      });
      if (!res.ok) throw new Error("Invalid credentials.");
      const data = await res.json();
      setToken(data.access_token);
      localStorage.setItem("token", data.access_token || "");
      setLoading(false);
      return true;
    } catch (err) {
      setLoading(false);
      throw (err.message || "Failed to login");
    }
  }

  // PUBLIC_INTERFACE
  async function register({ username, email, password }) {
    setLoading(true);
    try {
      await backendFetch(`${API_BASE}/auth/register`, {
        method: "POST",
        body: { username, email, password },
      });
      // After register, proceed to login
      await login({ username, password });
      setLoading(false);
      return true;
    } catch (err) {
      setLoading(false);
      throw (err.raw?.detail || "Failed to register");
    }
  }

  // PUBLIC_INTERFACE
  function logout() {
    setUser(null);
    setToken("");
    localStorage.removeItem("token");
  }

  return (
    <AuthContext.Provider value={{
      user, token, login, register, logout, loading,
      isAuthenticated: !!user
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---- UI COMPONENTS ----

// Navbar
function Navbar({ onShowLogin, onShowRegister }) {
  const auth = useAuth();
  return (
    <nav className="navbar">
      <div className="navbar-brand">notekeeper</div>
      <div className="navbar-links">
        {auth.isAuthenticated ? (
          <>
            <span className="navbar-user">{auth.user?.username}</span>
            <button className="btn" onClick={auth.logout}>Logout</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={onShowLogin}>Login</button>
            <button className="btn accent" onClick={onShowRegister}>Register</button>
          </>
        )}
      </div>
    </nav>
  );
}

// Sidebar for search and filters
function Sidebar({ searchTerm, setSearchTerm }) {
  return (
    <aside className="sidebar">
      <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      {/* Extend for future category/filter options */}
    </aside>
  );
}

// Search bar component
function SearchBar({ searchTerm, setSearchTerm }) {
  return (
    <input
      className="search-input"
      type="text"
      placeholder="Search notes..."
      value={searchTerm}
      onChange={e => setSearchTerm(e.target.value)}
      aria-label="Search notes"
    />
  );
}

// Modal dialog generic
function Modal({ show, onClose, children }) {
  if (!show) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        {children}
      </div>
    </div>
  );
}

// Notes list and individual note card
function NotesList({ notes, onEdit, onDelete }) {
  if (notes.length === 0) {
    return <p className="empty-msg">No notes found.</p>;
  }
  return (
    <div className="notes-list">
      {notes.map(note => (
        <NoteCard key={note.id} note={note} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}

function NoteCard({ note, onEdit, onDelete }) {
  return (
    <div className="note-card">
      <div className="note-title-row">
        <h3>{note.title}</h3>
        <span className="note-date">{new Date(note.last_edited).toLocaleString()}</span>
      </div>
      <p className="note-content">{note.content.length > 150 ? (note.content.slice(0, 150) + "...") : note.content}</p>
      <div className="note-actions">
        <button className="btn small" onClick={() => onEdit(note)}>Edit</button>
        <button className="btn small danger" onClick={() => onDelete(note)}>Delete</button>
      </div>
    </div>
  );
}

// Note creation/editing modal
function NoteModal({ show, onClose, onSave, noteData }) {
  const [title, setTitle] = useState(noteData?.title || "");
  const [content, setContent] = useState(noteData?.content || "");

  useEffect(() => {
    // Reset fields if noteData changes (e.g. edit mode)
    setTitle(noteData?.title || "");
    setContent(noteData?.content || "");
  }, [noteData, show]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    onSave({ ...noteData, title, content });
  }

  return (
    <Modal show={show} onClose={onClose}>
      <form className="note-form" onSubmit={handleSubmit} autoComplete="off">
        <h2>{noteData && noteData.id ? "Edit Note" : "New Note"}</h2>
        <input
          type="text"
          placeholder="Title"
          value={title}
          autoFocus
          maxLength={100}
          onChange={e => setTitle(e.target.value)}
          required
        />
        <textarea
          placeholder="Content"
          value={content}
          rows={6}
          onChange={e => setContent(e.target.value)}
          required
        />
        <button className="btn accent submit" type="submit">
          {noteData && noteData.id ? "Update" : "Create"}
        </button>
      </form>
    </Modal>
  );
}

// Login modal
function LoginModal({ show, onClose, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  function handleSubmit(e) {
    e.preventDefault();
    onLogin({ username, password }).catch(err => setErrorMsg(err.message || err));
  }
  useEffect(() => {
    if (!show) setErrorMsg("");
  }, [show]);
  return (
    <Modal show={show} onClose={onClose}>
      <form className="auth-form" onSubmit={handleSubmit} autoComplete="off">
        <h2>Login</h2>
        <input type="text" placeholder="Username" value={username}
          onChange={e => setUsername(e.target.value)} required autoFocus />
        <input type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)} required />
        {errorMsg ? <div className="error-msg">{errorMsg}</div> : null}
        <button className="btn accent submit" type="submit">Login</button>
      </form>
    </Modal>
  );
}

// Registration modal
function RegisterModal({ show, onClose, onRegister }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  function handleSubmit(e) {
    e.preventDefault();
    onRegister({ username, email, password }).catch(err => setErrorMsg(err.message || err));
  }
  useEffect(() => {
    if (!show) setErrorMsg("");
  }, [show]);
  return (
    <Modal show={show} onClose={onClose}>
      <form className="auth-form" onSubmit={handleSubmit} autoComplete="off">
        <h2>Register</h2>
        <input type="text" placeholder="Username" value={username}
          onChange={e => setUsername(e.target.value)} required autoFocus />
        <input type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password (min 6 chars)" value={password}
          onChange={e => setPassword(e.target.value)} required minLength={6} />
        {errorMsg ? <div className="error-msg">{errorMsg}</div> : null}
        <button className="btn accent submit" type="submit">Register</button>
      </form>
    </Modal>
  );
}

// Main Notes Page (list, CRUD, modal controls)
function NotesPage() {
  const auth = useAuth();
  const [notes, setNotes] = useState([]);
  const [filter, setFilter] = useState(""); // Currently unused, for extension
  const [searchTerm, setSearchTerm] = useState("");
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch all notes or search results as searchTerm changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetcher = searchTerm.trim()
      ? backendFetch(`${API_BASE}/notes/search/`, {
        token: auth.token,
        params: { q: searchTerm, local_kw: LOCAL_KW }
      })
      : backendFetch(`${API_BASE}/notes/`, {
        token: auth.token,
        params: { local_kw: LOCAL_KW }
      });
    fetcher
      .then((data) => { if (!cancelled) setNotes(data); setLoading(false); })
      .catch(() => { if (!cancelled) setNotes([]); setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [searchTerm, auth.token]);

  // CRUD operations
  async function handleCreateOrEdit(note) {
    setLoading(true);
    try {
      if (note.id) {
        // EDIT
        await backendFetch(`${API_BASE}/notes/${note.id}?local_kw=${LOCAL_KW}`, {
          method: "PUT",
          token: auth.token,
          body: { title: note.title, content: note.content },
        });
      } else {
        // CREATE
        await backendFetch(`${API_BASE}/notes/?local_kw=${LOCAL_KW}`, {
          method: "POST",
          token: auth.token,
          body: { title: note.title, content: note.content },
        });
      }
      setNoteModalOpen(false);
      setNoteToEdit(null);
      // Refetch notes
      setLoading(true);
      const notesData = await backendFetch(`${API_BASE}/notes/?local_kw=${LOCAL_KW}`, {
        token: auth.token,
      });
      setNotes(notesData);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      alert("Failed to save note: " + (err.message || "Error"));
    }
  }
  async function handleDelete(note) {
    if (!window.confirm("Delete this note?")) return;
    setLoading(true);
    try {
      await backendFetch(`${API_BASE}/notes/${note.id}?local_kw=${LOCAL_KW}`, {
        method: "DELETE",
        token: auth.token,
      });
      // Refetch notes
      setNotes(notes.filter(n => n.id !== note.id));
      setLoading(false);
    } catch (err) {
      setLoading(false);
      alert("Failed to delete note: " + (err.message || "Error"));
    }
  }

  function startEdit(note) {
    setNoteToEdit(note);
    setNoteModalOpen(true);
  }

  return (
    <main className="main-content">
      <div className="main-header-row">
        <h1>Your Notes</h1>
        <button className="btn accent" onClick={() => { setNoteToEdit(null); setNoteModalOpen(true); }}>
          + Create Note
        </button>
      </div>
      <Sidebar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      {loading ? <div className="loading-indicator">Loading…</div> : (
        <NotesList notes={notes} onEdit={startEdit} onDelete={handleDelete} />
      )}
      <NoteModal
        show={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        onSave={handleCreateOrEdit}
        noteData={noteToEdit}
      />
    </main>
  );
}

// Main App
function App() {
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  return (
    <AuthProvider>
      <AppInner
        showLogin={showLogin}
        setShowLogin={setShowLogin}
        showRegister={showRegister}
        setShowRegister={setShowRegister}
      />
    </AuthProvider>
  );
}

// Separated inner app to use hooks at top-level
function AppInner({ showLogin, setShowLogin, showRegister, setShowRegister }) {
  const auth = useAuth();

  return (
    <div className="app-container">
      <Navbar
        onShowLogin={() => setShowLogin(true)}
        onShowRegister={() => setShowRegister(true)}
      />
      <AuthGate
        onShowLogin={() => setShowLogin(true)}
      >
        <NotesPage />
      </AuthGate>
      <LoginModal
        show={showLogin}
        onClose={() => setShowLogin(false)}
        onLogin={async ({ username, password }) => {
          await auth.login({ username, password });
          setShowLogin(false);
        }}
      />
      <RegisterModal
        show={showRegister}
        onClose={() => setShowRegister(false)}
        onRegister={async (details) => {
          await auth.register(details);
          setShowRegister(false);
        }}
      />
    </div>
  );
}

// PUBLIC_INTERFACE
function AuthGate({ children, onShowLogin }) {
  const auth = useAuth();
  if (auth.loading) return <div className="loading-indicator">Loading...</div>;
  if (!auth.isAuthenticated)
    return (
      <div className="locked-container">
        <h2>Sign in to access your notes</h2>
        <button className="btn accent large" onClick={onShowLogin}>Sign In</button>
      </div>
    );
  return children;
}

export default App;
