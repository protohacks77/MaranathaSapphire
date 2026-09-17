import { usePagedQuery } from '../../services/usePagedQuery';
import LoadMore from '../../components/utils/LoadMore';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { Notification } from '../../types';
import PageSkeleton from '../../components/utils/SkeletonLoader';
import { Bell, Clock, Key, MessageSquare, Search } from 'lucide-react';
import firebase from 'firebase/compat/app';
import { useNavigate } from 'react-router-dom';

const NotificationIcon = ({ type }: { type: Notification['type']}) => {
    switch (type) {
        case 'password_change':
            return <Key className="text-yellow-400" size={20} />;
        case 'message':
            return <MessageSquare className="text-sky-400" size={20} />;
        default:
            return <Bell className="text-gray-400" size={20} />;
    }
}

const NotificationsPage: React.FC = () => {

  const { currentUser } = useAuth();
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('unread');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const notificationQuery = useMemo(() => {
    let query: firebase.firestore.Query = db.collection('notifications').where('recipientId', '==', currentUser?.uid || '__signedout__');
    if (filter !== 'all') query = query.where('read', '==', filter === 'read');
    return query.orderBy('createdAt', 'desc');
  }, [currentUser?.uid, filter]);
  const { records: notifications, loading, loadingMore, hasMore, error, indexUrl, loadMore, refresh } = usePagedQuery<Notification>(notificationQuery, `notifications:${currentUser?.uid}:${filter}`, Boolean(currentUser));
  const viewedUnread = useRef(new Set<string>());
  useEffect(() => { notifications.filter(notification => !notification.read).forEach(notification => viewedUnread.current.add(notification.id!)); }, [notifications]);
  useEffect(() => {
    viewedUnread.current.clear();
    return () => {
      const ids = [...viewedUnread.current];
      for (let offset = 0; offset < ids.length; offset += 400) {
        const batch = db.batch();
        ids.slice(offset, offset + 400).forEach(id => batch.update(db.collection('notifications').doc(id), { read: true }));
        batch.commit().catch(console.error);
      }
    };
  }, [currentUser?.uid]);

  const filteredNotifications = useMemo(() => {
    return notifications
        .filter(notification => {
            if (filter === 'all') return true;
            if (filter === 'read') return notification.read;
            if (filter === 'unread') return !notification.read;
            return true;
        })
        .filter(notification => {
            if (!searchQuery) return true;
            const lowerCaseQuery = searchQuery.toLowerCase();
            return (
                notification.title.toLowerCase().includes(lowerCaseQuery) ||
                notification.message.toLowerCase().includes(lowerCaseQuery)
            );
        });
  }, [notifications, filter, searchQuery]);

  const handleNotificationClick = (notification: Notification) => {
    if (notification.link) {
        navigate(notification.link);
    }
  };

  const formatDate = (timestamp: any) => {
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleString();
    }
    return 'Just now';
  };

  const getEmptyStateMessage = () => {
    if (searchQuery) {
        return `No notifications found for "${searchQuery}".`;
    }
    switch (filter) {
        case 'read':
            return 'You have no read notifications.';
        case 'unread':
            return 'You have no unread notifications.';
        default:
            return 'You have no notifications.';
    }
  };


  if (loading) {
    return <PageSkeleton type="cards" />;
  }

  const FilterButton: React.FC<{
    value: 'all' | 'unread' | 'read';
    children: React.ReactNode;
  }> = ({ value, children }) => (
    <button
      onClick={() => setFilter(value)}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        filter === value
          ? 'bg-sky-600 text-white'
          : 'text-gray-300 hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-white self-start sm:self-center">Notifications</h1>
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-[#161B22] border border-gray-700 p-1 rounded-lg">
                <FilterButton value="all">All</FilterButton>
                <FilterButton value="unread">Unread</FilterButton>
                <FilterButton value="read">Read</FilterButton>
            </div>
            <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                    type="text"
                    placeholder="Search notifications..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
            </div>
        </div>
      </div>
      <div className="space-y-4">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map(notification => (
            <div 
              key={notification.id} 
              onClick={() => handleNotificationClick(notification)}
              className={`bg-[#161B22] border rounded-lg p-4 flex items-start space-x-4 transition-colors ${!notification.read ? 'border-sky-800' : 'border-gray-700'} ${notification.link ? 'cursor-pointer hover:bg-gray-800' : ''}`}
            >
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-800 flex items-center justify-center">
                <NotificationIcon type={notification.type} />
              </div>
              <div className="flex-1">
                <p className={`font-semibold ${!notification.read ? 'text-white' : 'text-gray-300'}`}>{notification.title}</p>
                <p className="text-sm text-gray-300 mt-1">{notification.message}</p>
                <div className="text-xs text-gray-500 mt-2 flex items-center">
                  <Clock size={12} className="mr-1.5" />
                  <span>{formatDate(notification.createdAt)} from {notification.senderName}</span>
                </div>
              </div>
              {!notification.read && (
                <div className="w-2.5 h-2.5 bg-sky-500 rounded-full self-center animate-pulse" title="Unread"></div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-[#161B22] border border-gray-700 rounded-lg">
            <p className="text-gray-400">{getEmptyStateMessage()}</p>
          </div>
        )}
      </div>
      <LoadMore hasMore={hasMore} loading={loadingMore} error={error} indexUrl={indexUrl} onLoad={loadMore} onRetry={refresh} />
    </div>
  );
};

export default NotificationsPage;