/* context/NotificationContext.tsx */
import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface Notification {
  id: number;
  message: string;
  type: NotificationType;
}

interface NotificationContextType {
  addNotification: (message: string, type: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

const NotificationComponent: React.FC<Notification & { onDismiss: (id: number) => void }> = ({ id, message, type, onDismiss }) => {
    const [isDismissing, setIsDismissing] = useState(false);

    useEffect(() => {
        // Show for 2 seconds as requested
        const timer = setTimeout(() => {
            setIsDismissing(true);
            // Wait for animation to finish before removing from state
            const dismissTimer = setTimeout(() => {
                onDismiss(id);
            }, 400); // Animation duration
            return () => clearTimeout(dismissTimer);
        }, 2000); 
        return () => clearTimeout(timer);
    }, [id, onDismiss]);

    const typeStyles = {
        success: { icon: <CheckCircle className="text-green-400" size={20} />, bg: 'bg-gray-800', border: 'border-green-500' },
        error: { icon: <XCircle className="text-red-400" size={20} />, bg: 'bg-gray-800', border: 'border-red-500' },
        warning: { icon: <AlertTriangle className="text-yellow-400" size={20} />, bg: 'bg-gray-800', border: 'border-yellow-500' },
        info: { icon: <Info className="text-sky-400" size={20} />, bg: 'bg-gray-800', border: 'border-sky-500' }
    };

    const styles = typeStyles[type];

    return (
        <div 
            className={`modern-notification ${isDismissing ? 'slide-out' : 'slide-in'} ${styles.bg} border-l-4 ${styles.border}`}
            role="alert"
        >
            <div className="flex-shrink-0 mr-3">{styles.icon}</div>
            <p className="text-gray-100 text-sm font-medium">{message}</p>
        </div>
    );
};


export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((message: string, type: NotificationType) => {
    const isOffline = !navigator.onLine;
    let finalMessage = message;
    
    if (isOffline && (type === 'success' || type === 'info')) {
        finalMessage = `${message} (Saved Locally)`;
    }

    const id = Date.now();
    setNotifications(prev => [...prev, { id, message: finalMessage, type }]);
  }, []);

  const removeNotification = useCallback((id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ addNotification }}>
      {children}
      <div className="notification-container">
        {notifications.map(n => (
          <NotificationComponent key={n.id} {...n} onDismiss={removeNotification} />
        ))}
      </div>
    </NotificationContext.Provider>
  );
};
