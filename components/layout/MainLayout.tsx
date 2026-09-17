import { ensureInboxSummary, inboxReference } from '../../services/inboxSummary';

import React, { useState, useEffect } from 'react';
// FIX: Removed unused Outlet import for react-router-dom v5 compatibility.
import Sidebar from './Sidebar';
import Header from './Header';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebase';
import { ChatConversation } from '../../types';

// FIX: Updated component signature to accept children for react-router-dom v5.
const MainLayout: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const isPatientOverview = /^\/patients\/[^/]+\/?$/.test(pathname);
  const isPatientClerking = /^\/patients\/[^/]+\/clerking-sheet\/?$/.test(pathname);
  const isPatientRecords = /^\/patients\/[^/]+\/records\//.test(pathname);
  const { currentUser } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  useEffect(() => {
    if (!currentUser) return;

    const notificationsRef = db.collection('notifications')
      .where('recipientId', '==', currentUser.uid)
      .where('read', '==', false);

    const unsubscribe = notificationsRef.onSnapshot(snapshot => {
      setUnreadCount(snapshot.size);
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    ensureInboxSummary(currentUser.uid).catch(console.error);
    const unsubscribe = inboxReference(currentUser.uid).onSnapshot(doc => {
        setUnreadMessageCount(Number(doc.data()?.unreadMessages || 0));
    });

    return () => unsubscribe();
  }, [currentUser]);


  return (
    <div className="flex h-screen bg-[#0D1117] text-gray-200">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} unreadMessageCount={unreadMessageCount} />
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
        <Header setSidebarOpen={setSidebarOpen} unreadCount={unreadCount} unreadMessageCount={unreadMessageCount} />
        <main className={`flex-1 min-h-0 bg-[#0D1117] ${isPatientRecords ? 'patient-panel-scroll' : ''} ${isPatientOverview ? 'overflow-hidden' : isPatientClerking ? 'overflow-x-hidden overflow-y-auto lg:overflow-hidden' : 'overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-8'}`}>
          {/* FIX: Replaced v6 <Outlet /> with children for v5. */}
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;