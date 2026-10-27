import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, Link, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { Avatar, Icon, useClickOutside } from './ui.jsx';
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

export const ROLE_LABEL = { admin: 'Admin', reviewer: 'MLR reviewer', rep: 'Medical rep' };

function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside(close);
  return (
    <div className="usermenu" ref={ref}>
      <button className="userbtn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <Avatar name={user.name} size="sm" />
        <span className="who">{user.name}<span>{ROLE_LABEL[user.role]}</span></span>
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="meta"><strong>{user.name}</strong>{user.email}</div>
          <button role="menuitem" onClick={onSignOut}><Icon name="logout" />Sign out</button>
        </div>
      )}
    </div>
  );
}

function Shell({ user, onSignOut }) {
  const location = useLocation();
  const [inReview, setInReview] = useState(0);
  const canReview = user.role !== 'rep';

  // Badge on "Presentations" when materials wait for MLR review.
  useEffect(() => {
    if (!canReview) return;
    api.get('/api/stats/overview').then((d) => setInReview(d.in_review || 0)).catch(() => {});
  }, [location.pathname, canReview]);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="Rx Omnichannel home">
            <img src="/brand/stada-logo.png" alt="STADA" />
            <span className="app"><strong>Rx Omnichannel</strong>Kazakhstan</span>
          </Link>
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end>Overview</NavLink>
            <NavLink to="/doctors">Doctors</NavLink>
            <NavLink to="/presentations">
              Presentations{canReview && inReview > 0 && <span className="count" aria-label={`${inReview} waiting for review`}>{inReview}</span>}
            </NavLink>
            <NavLink to="/send">Send</NavLink>
            {user.role === 'admin' && <NavLink to="/users">Team</NavLink>}
          </nav>
          <UserMenu user={user} onSignOut={onSignOut} />
        </div>
      </header>
      <main>
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
      <footer className="footer">
        <span>STADA Kazakhstan, Rx Omnichannel. For internal use by STADA employees.</span>
        <span>Materials are shared with healthcare professionals only.</span>
      </footer>
    </>
  );
}

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
      <Shell user={user} onSignOut={signOut} />
    </AuthContext.Provider>
  );
}
