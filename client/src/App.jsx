import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import SetPasswordPage from './pages/SetPasswordPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import MetricBuilderPage from './pages/MetricBuilderPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import ImportPage from './pages/ImportPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public pages */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/set-password" element={<SetPasswordPage />} />

          {/* Logged-in pages share the header/nav */}
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/metrics" element={<RequireAuth admin><MetricBuilderPage /></RequireAuth>} />
            <Route path="/data" element={<RequireAuth admin><ImportPage /></RequireAuth>} />
            <Route path="/users" element={<RequireAuth admin><UsersPage /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth admin><SettingsPage /></RequireAuth>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
