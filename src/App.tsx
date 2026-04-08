import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { StudentView } from './pages/StudentView';
import { DataEntry } from './pages/DataEntry';
import { MassEntry } from './pages/MassEntry';
import { GoalManagement } from './pages/GoalManagement';
import { ProgressGraph } from './pages/ProgressGraph';
import { AdminPanel } from './pages/AdminPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';

const ProtectedRoute = ({ children, requiredRole }: { children: React.ReactNode, requiredRole?: string }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }

  if (!user || !profile) {
    return <Navigate to="/login" />;
  }

  if (requiredRole && profile.role !== requiredRole) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="student/:studentId" element={<StudentView />} />
              <Route path="student/:studentId/data" element={<DataEntry />} />
              <Route path="student/:studentId/mass" element={<MassEntry />} />
              <Route path="student/:studentId/goals" element={<GoalManagement />} />
              <Route path="student/:studentId/graph" element={<ProgressGraph />} />
              <Route path="student/:studentId/history" element={<ProgressGraph isHistory />} />
              <Route path="goals" element={<GoalManagement isBankView />} />
              <Route path="admin" element={
                <ProtectedRoute requiredRole="admin">
                  <AdminPanel />
                </ProtectedRoute>
              } />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </ErrorBoundary>
  );
}
