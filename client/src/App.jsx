import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom';
import { api } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Doctors from './pages/Doctors.jsx';
import DoctorDetail from './pages/DoctorDetail.jsx';
import Presentations from './pages/Presentations.jsx';
import PresentationDetail from './pages/PresentationDetail.jsx';
import Send from './pages/Send.jsx';
import Users from './pages/Users.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const ROLE_LABEL = { admin: 'Admin', reviewer: 'MLR reviewer', rep: 'Medical rep' };

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking

  useEffect(() => {
    api.get('/api/auth/me').then(setUser).catch(() => setUser(null));
    const onExpired = () => setUser(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  if (user === undefined) return null;
  if (!user) return <Login onSignedIn={setUser} />;

  const signOut = async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={user}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand"><strong>Rx Omnichannel</strong><span>Stada Kazakhstan</span></Link>
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end>Overview</NavLink>
            <NavLink to="/doctors">Doctors</NavLink>
            <NavLink to="/presentations">Presentations</NavLink>
            <NavLink to="/send">Send</NavLink>
            {user.role === 'admin' && <NavLink to="/users">Team</NavLink>}
          </nav>
          <div className="who">
            <span className="name">{user.name} <span className="muted">({ROLE_LABEL[user.role]})</span></span>
            <button className="btn ghost sm" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/doctors" element={<Doctors />} />
          <Route path="/doctors/:id" element={<DoctorDetail />} />
          <Route path="/presentations" element={<Presentations />} />
          <Route path="/presentations/:id" element={<PresentationDetail />} />
          <Route path="/send" element={<Send />} />
          {user.role === 'admin' && <Route path="/users" element={<Users />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </AuthContext.Provider>
  );
}
