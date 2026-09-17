

import React, { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import LoginPage from './features/auth/LoginPage';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { seedDatabase } from './services/seed';
import Dashboard from './features/dashboard/Dashboard';
import UserManagement from './features/admin/UserManagement';
import PatientRegistration from './features/accounts/PatientRegistration';
import Billing from './features/accounts/Billing';
import PatientProfile from './features/patients/PatientProfile';
import Settings from './features/settings/Settings';
import ScrollToTop from './components/utils/ScrollToTop';
import NotificationsPage from './features/notifications/NotificationsPage';
import PriceListManagement from './features/accounts/PriceListManagement';
import Reports from './features/accounts/Reports';
import DischargeApproval from './features/accounts/DischargeApproval';
import PatientManagement from './features/accounts/PatientManagement';
import BillDetails from './features/bills/BillDetails';
import WardManagement from './features/admin/WardManagement';
import InventoryManagement from './features/pharmacy/InventoryManagement';
import ChatPage from './features/messaging/ChatPage';
import StationariesPage from './features/stationaries/StationariesPage';
import AnalyticsDashboard from './features/admin/AnalyticsDashboard';

export default function App() {
  useEffect(() => {
    seedDatabase().catch(err => console.warn("Seed check error:", err));
  }, []);

  return (
    <AuthProvider>
      <NotificationProvider>
        <HashRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <MainLayout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/admin/users" element={<UserManagement />} />
                    <Route path="/admin/wards" element={<WardManagement />} />
                    <Route path="/admin/analytics" element={<AnalyticsDashboard />} />
                    <Route path="/accounts/register" element={<PatientRegistration />} />
                    <Route path="/accounts/billing" element={<Billing />} />
                    <Route path="/accounts/pricelist" element={<PriceListManagement />} />
                    <Route path="/accounts/reports" element={<Reports />} />
                    <Route path="/accounts/discharge-approval" element={<DischargeApproval />} />
                    <Route path="/accounts/patients" element={<PatientManagement />} />
                    <Route path="/pharmacy/inventory" element={<InventoryManagement />} />
                    <Route path="/patients/:id/*" element={<PatientProfile />} />
                    <Route path="/bills/:billId" element={<BillDetails />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="/messages/:chatId" element={<ChatPage />} />
                    <Route path="/messages" element={<ChatPage />} />
                    <Route path="/stationaries" element={<StationariesPage />} />
                  </Routes>
                </MainLayout>
              </ProtectedRoute>
            } />
          </Routes>
        </HashRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
