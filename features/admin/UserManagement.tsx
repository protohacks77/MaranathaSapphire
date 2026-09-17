import { usePagedQuery } from '../../services/usePagedQuery';
import LoadMore from '../../components/utils/LoadMore';
import firebase from 'firebase/compat/app';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { db } from '../../services/firebase';
import { UserProfile } from '../../types';
import LoadingSpinner from '../../components/utils/LoadingSpinner';
import { Edit, Trash2, Send, Plus, Search, Mail, Building, Key, MessageSquare, LayoutGrid, Table as TableIcon } from 'lucide-react';
import AddUserModal from './AddUserModal';
import EditUserModal from './EditUserModal';
import SendMessageModal from './SendMessageModal';
import { useNotification } from '../../context/NotificationContext';
import Modal from '../../components/utils/Modal';
import ResetPasswordModal from './ResetPasswordModal';
import { useNavigate } from 'react-router-dom';
import { getOrCreateChat } from '../../services/chatService';
import { useAuth } from '../../context/AuthContext';
import UserActivityModal from './UserActivityModal';


const UserManagement: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [isSendModalOpen, setSendModalOpen] = useState(false);
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isResetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
  const [isActivityModalOpen, setActivityModalOpen] = useState(false);


  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const { addNotification } = useNotification();
  const navigate = useNavigate();
  const { userProfile: currentUserProfile } = useAuth();


  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => { const timer = setTimeout(() => setSearchTerm(searchQuery.trim().toLowerCase()), 300); return () => clearTimeout(timer); }, [searchQuery]);
  const usersQuery = useMemo(() => {
      let query: firebase.firestore.Query = db.collection('users');
      if (searchTerm.length >= 2) query = query.where('searchPrefixes', 'array-contains', searchTerm);
      return query.orderBy('name');
  }, [searchTerm]);
  const { records: users, loading, loadingMore, hasMore, error, indexUrl, loadMore, refresh: fetchUsers } = usePagedQuery<UserProfile>(usersQuery, `users:${searchTerm}`);
  const filteredUsers = users;

  const handleEdit = (e: React.MouseEvent, user: UserProfile) => {
    e.stopPropagation();
    setSelectedUser(user);
    setEditModalOpen(true);
  };

  const handleSendMessage = (e: React.MouseEvent, user: UserProfile) => {
    e.stopPropagation();
    setSelectedUser(user);
    setSendModalOpen(true);
  };
  
  const handleDelete = (e: React.MouseEvent, user: UserProfile) => {
    e.stopPropagation();
    setSelectedUser(user);
    setDeleteModalOpen(true);
  };

  const handleResetPassword = (e: React.MouseEvent, user: UserProfile) => {
    e.stopPropagation();
    setSelectedUser(user);
    setResetPasswordModalOpen(true);
  };
  
  const handleViewActivity = (user: UserProfile) => {
    setSelectedUser(user);
    setActivityModalOpen(true);
  };

  const handleStartChat = async (e: React.MouseEvent, user: UserProfile) => {
    e.stopPropagation();
    if (!currentUserProfile) {
        addNotification('You must be logged in to start a chat.', 'error');
        return;
    }
    if (currentUserProfile.id === user.id) {
        addNotification("You can't message yourself.", "warning");
        return;
    }
    try {
        const chatId = await getOrCreateChat(currentUserProfile.id, user.id);
        navigate(`/messages/${chatId}`);
    } catch (error) {
        console.error("Error starting chat:", error);
        addNotification('Could not start chat session.', 'error');
    }
  }

  const confirmDelete = async () => {
    if (!selectedUser) return;
    try {
      // Note: This only deletes the user profile from Firestore.
      // The Firebase Auth user is not deleted, as this requires admin privileges
      // or re-authentication, best handled by a cloud function in production.
      await db.collection('users').doc(selectedUser.id).delete();
      addNotification('User deleted successfully.', 'success');
      setDeleteModalOpen(false);
      setSelectedUser(null);
      fetchUsers(); // Refetch users
    } catch (error) {
      console.error("Error deleting user:", error);
      addNotification('Failed to delete user.', 'error');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold text-white">User Management</h1>
            <p className="text-gray-400 text-sm mt-1">Manage system access and permissions</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-grow md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-lg bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          
          {/* View Toggle */}
          <div className="flex bg-[#161B22] border border-gray-700 rounded-lg p-1">
                <button 
                    onClick={() => setViewMode('cards')}
                    className={`p-2 rounded-md transition-all ${viewMode === 'cards' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                    title="Card View"
                >
                    <LayoutGrid size={18} />
                </button>
                <button 
                    onClick={() => setViewMode('table')}
                    className={`p-2 rounded-md transition-all ${viewMode === 'table' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                    title="Table View"
                >
                    <TableIcon size={18} />
                </button>
            </div>

          <button onClick={() => setAddModalOpen(true)} className="flex items-center justify-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-lg shadow-sky-900/20 transition-all">
            <Plus size={18} />
            <span className="hidden sm:inline">Add User</span>
          </button>
        </div>
      </div>

      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredUsers.map(user => (
            <div key={user.id} className="bg-[#161B22] border border-gray-700 rounded-xl shadow-md flex flex-col justify-between p-6 transition-all hover:shadow-sky-500/20 hover:border-sky-700/50 group">
                <div
                className="cursor-pointer"
                onClick={() => handleViewActivity(user)}
                aria-label={`View activity for ${user.name}`}
                >
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-600 to-blue-700 flex items-center justify-center text-white font-bold text-sm shadow-inner">
                            {user.name.charAt(0)}{user.surname.charAt(0)}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white group-hover:text-sky-400 transition-colors">{user.name} {user.surname}</h3>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-800 text-sky-300 border border-gray-700 mt-1">
                                {user.role}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center p-2 bg-gray-800/50 rounded-lg text-gray-300">
                        <Mail size={14} className="mr-3 text-gray-500" /> 
                        <span className="truncate">{user.email}</span>
                    </div>
                    <div className="flex items-center p-2 bg-gray-800/50 rounded-lg text-gray-300">
                        <Building size={14} className="mr-3 text-gray-500" /> 
                        <span>{user.department}</span>
                    </div>
                </div>
                </div>
                <div className="flex items-center justify-end gap-1 mt-6 pt-4 border-t border-gray-700">
                <button onClick={(e) => handleSendMessage(e, user)} className="p-2 text-gray-400 hover:text-green-400 hover:bg-green-400/10 rounded-md transition-colors" title="Send System Notification"><Send size={18} /></button>
                <button onClick={(e) => handleStartChat(e, user)} className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-md transition-colors" title="Chat Message"><MessageSquare size={18} /></button>
                <button onClick={(e) => handleResetPassword(e, user)} className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-md transition-colors" title="Reset Password"><Key size={18} /></button>
                <button onClick={(e) => handleEdit(e, user)} className="p-2 text-gray-400 hover:text-sky-400 hover:bg-sky-400/10 rounded-md transition-colors" title="Edit User"><Edit size={18} /></button>
                <button onClick={(e) => handleDelete(e, user)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors" title="Delete User"><Trash2 size={18} /></button>
                </div>
            </div>
            ))}
        </div>
      ) : (
        <div className="bg-[#161B22] border border-gray-700 rounded-xl shadow-sm overflow-hidden animate-slide-in-top">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 border-b border-gray-700">
                        <tr>
                            <th className="px-6 py-4 font-medium">User</th>
                            <th className="px-6 py-4 font-medium">Role</th>
                            <th className="px-6 py-4 font-medium">Department</th>
                            <th className="px-6 py-4 font-medium">Email</th>
                            <th className="px-6 py-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {filteredUsers.map((user) => (
                            <tr 
                                key={user.id} 
                                className="hover:bg-gray-800/30 transition-colors group cursor-pointer"
                                onClick={() => handleViewActivity(user)}
                            >
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 font-bold text-xs border border-gray-600">
                                            {user.name.charAt(0)}{user.surname.charAt(0)}
                                        </div>
                                        <span className="font-medium text-white group-hover:text-sky-400 transition-colors">
                                            {user.name} {user.surname}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900/30 text-blue-400 border border-blue-800">
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-300">
                                    {user.department}
                                </td>
                                <td className="px-6 py-4 text-gray-400 font-mono text-xs">
                                    {user.email}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <button onClick={(e) => handleSendMessage(e, user)} className="p-1.5 text-gray-400 hover:text-green-400 transition-colors" title="Send System Notification"><Send size={16} /></button>
                                        <button onClick={(e) => handleStartChat(e, user)} className="p-1.5 text-gray-400 hover:text-blue-400 transition-colors" title="Chat Message"><MessageSquare size={16} /></button>
                                        <button onClick={(e) => handleResetPassword(e, user)} className="p-1.5 text-gray-400 hover:text-yellow-400 transition-colors" title="Reset Password"><Key size={16} /></button>
                                        <button onClick={(e) => handleEdit(e, user)} className="p-1.5 text-gray-400 hover:text-sky-400 transition-colors" title="Edit User"><Edit size={16} /></button>
                                        <button onClick={(e) => handleDelete(e, user)} className="p-1.5 text-gray-400 hover:text-red-400 transition-colors" title="Delete User"><Trash2 size={16} /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {filteredUsers.length === 0 && (
                <div className="text-center py-12">
                    <p className="text-gray-500">No users found matching your search.</p>
                </div>
            )}
        </div>
      )}

      <AddUserModal isOpen={isAddModalOpen} onClose={() => setAddModalOpen(false)} onUserAdded={fetchUsers} />
      {selectedUser && <EditUserModal isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} user={selectedUser} onUserUpdated={fetchUsers} />}
      {selectedUser && <SendMessageModal isOpen={isSendModalOpen} onClose={() => setSendModalOpen(false)} recipient={selectedUser} />}
      {selectedUser && <ResetPasswordModal isOpen={isResetPasswordModalOpen} onClose={() => setResetPasswordModalOpen(false)} userToReset={selectedUser} />}
      {selectedUser && <UserActivityModal isOpen={isActivityModalOpen} onClose={() => setActivityModalOpen(false)} user={selectedUser} />}
      
      <Modal isOpen={isDeleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Confirm Delete">
        <p className="text-gray-400">Are you sure you want to delete {selectedUser?.name} {selectedUser?.surname}? This action cannot be undone.</p>
        <div className="mt-6 flex justify-end space-x-4">
          <button onClick={() => setDeleteModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
          <button onClick={confirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700">Delete User</button>
        </div>
      </Modal>

      <LoadMore hasMore={hasMore} loading={loadingMore} error={error} indexUrl={indexUrl} onLoad={loadMore} onRetry={fetchUsers} />
    </div>
  );
};

export default UserManagement;