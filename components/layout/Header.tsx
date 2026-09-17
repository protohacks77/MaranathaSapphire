
import React, { useState, useEffect } from 'react';
import { Menu, Bell, WifiOff } from 'lucide-react';
import { useNavigate, NavLink } from 'react-router-dom';
import { auth } from '../../services/firebase';
import Modal from '../utils/Modal';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  setSidebarOpen: (open: boolean) => void;
  unreadCount: number;
  unreadMessageCount: number;
}

const Header: React.FC<HeaderProps> = ({ setSidebarOpen, unreadCount, unreadMessageCount }) => {
  const navigate = useNavigate();
  const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);
  const { userProfile } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLogout = async () => {
    await auth.signOut();
    setLogoutModalOpen(false);
    navigate('/login');
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 bg-[#161B22] border-b border-gray-700 no-print sticky top-0 z-40">
        <div className="flex items-center min-w-0">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 focus:outline-none lg:hidden mr-3">
            <span className="flickering-dot-container">
                <Menu size={24} />
                {unreadMessageCount > 0 && <span className="flickering-dot"></span>}
            </span>
          </button>
          <div className="flex flex-col min-w-0">
            <h1 className="hidden md:block text-lg font-semibold text-gray-200 truncate">Maranatha-Sapphire</h1>
            <h1 className="block md:hidden text-lg font-semibold text-gray-200 truncate">Maranatha-Sapphire</h1>
            {userProfile && (
              <p className="text-xs text-gray-400 truncate max-w-[150px] sm:max-w-xs">
                {userProfile.name} {userProfile.surname} <span className="hidden sm:inline">({userProfile.role})</span>
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-3 sm:space-x-6 flex-shrink-0 ml-2">
          {!isOnline && (
            <div className="hidden sm:flex items-center text-yellow-500 bg-yellow-900/20 px-3 py-1 rounded-full border border-yellow-700/50 animate-pulse">
              <WifiOff size={16} className="mr-2" />
              <span className="text-xs font-semibold">Offline Mode</span>
            </div>
          )}

          <NavLink to="/notifications" className="text-gray-400 hover:text-white notification-badge-container p-1" aria-label="View notifications">
            <Bell size={24} />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </NavLink>
          
          <button className="Btn" onClick={() => setLogoutModalOpen(true)} aria-label="Logout">
            <div className="sign">
              <svg viewBox="0 0 512 512">
                <path d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z"></path>
              </svg>
            </div>
            <div className="text">Logout</div>
          </button>
        </div>
      </header>

      <Modal
        isOpen={isLogoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        title="Confirm Logout"
      >
        <p className="text-gray-400">Are you sure you want to log out?</p>
        <div className="mt-6 flex justify-end space-x-4">
          <button
            onClick={() => setLogoutModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-sky-500"
          >
            Confirm Logout
          </button>
        </div>
      </Modal>
    </>
  );
};

export default Header;
