import { type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { CursorGlow } from './components/CursorGlow';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Projects } from './pages/Projects';
import { Board } from './pages/Board';
import { IssueDetail } from './pages/IssueDetail';
import { AuditLog } from './pages/AuditLog';

function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />;
  if (admin && user.role !== 'ADMIN') return <Navigate to="/projects" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <CursorGlow />
      <Routes>
      <Route path="/auth/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:projectId" element={<Board />} />
        <Route path="/projects/:projectId/issues/:issueId" element={<IssueDetail />} />
        <Route path="/audit" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
    </>
  );
}
