import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import Auth from './pages/Auth';
import Courses from './pages/Courses';
import Course from './pages/Course';
import Profile from './pages/Profile';
import Reports from './pages/Reports';
import './style.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('courses');
  const [course, setCourse] = useState(null);
  useEffect(() => {
    async function syncAccount() {
      try { setUser(await api('/auth/me')); }
      catch { setUser(null); }
      finally { setLoading(false); }
    }
    function onStorage(event) { if (event.key === 'lms-auth-change') syncAccount(); }
    function onVisible() { if (document.visibilityState === 'visible') syncAccount(); }
    syncAccount();
    window.addEventListener('focus', syncAccount);
    window.addEventListener('storage', onStorage);
    window.addEventListener('lms-session-expired', syncAccount);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', syncAccount);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('lms-session-expired', syncAccount);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  // Clear the previous account's open course when another tab changes the login.
  useEffect(() => { setPage('courses'); setCourse(null); }, [user?.UserID]);
  if (loading) return <p className="loading">Loading LMS…</p>;
  if (!user) return <Auth onLogin={value => { setUser(value); setPage('courses'); setCourse(null); }} />;
  function navigate(value) { setPage(value); setCourse(null); }
  return <>
    <header><div className="header-inner"><strong>LMS <span>Learning Management System</span></strong><div>{user.FullName} <small>({user.Role})</small><button className="secondary" onClick={async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); }}>Log out</button></div></div></header>
    <div className="layout"><nav>
      <button className={page === 'courses' ? 'active' : ''} onClick={() => navigate('courses')}>{user.Role === 'Teacher' ? 'My courses' : 'Courses'}</button>
      <button className={page === 'reports' ? 'active' : ''} onClick={() => navigate('reports')}>{user.Role === 'Teacher' ? 'Reports' : 'My progress'}</button>
      <button className={page === 'profile' ? 'active' : ''} onClick={() => navigate('profile')}>My profile</button>
    </nav><main>
      {page === 'courses' && (course ? <Course key={course.CourseID} course={course} user={user} back={() => setCourse(null)} /> : <Courses user={user} open={setCourse} />)}
      {page === 'reports' && <Reports user={user} />}
      {page === 'profile' && <Profile user={user} />}
    </main></div>
  </>;
}
createRoot(document.getElementById('root')).render(<App />);
