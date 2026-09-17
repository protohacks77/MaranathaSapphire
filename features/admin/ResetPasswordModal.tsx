
import React, { useState } from 'react';
import Modal from '../../components/utils/Modal';
import { useNotification } from '../../context/NotificationContext';
import { db, auth } from '../../services/firebase';
import { UserProfile, Role } from '../../types';
import { useAuth } from '../../context/AuthContext';
import firebase from 'firebase/compat/app';
import { Info } from 'lucide-react';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  userToReset: UserProfile;
}

const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ isOpen, onClose, userToReset }) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const { addNotification } = useNotification();
  const { userProfile: adminProfile } = useAuth();

  const handleSendResetEmail = async () => {
    if (!adminProfile || adminProfile.role !== Role.Admin) {
      addNotification('You do not have permission to perform this action.', 'error');
      return;
    }

    setStatus('loading');
    try {
      await auth.sendPasswordResetEmail(userToReset.email);

      // Create an audit trail notification for other admins
      const adminsSnapshot = await db.collection('users').where('role', '==', Role.Admin).get();
      if (!adminsSnapshot.empty) {
        const batch = db.batch();
        adminsSnapshot.docs.forEach(adminDoc => {
          if (adminDoc.id === adminProfile.id) return; // Don't notify the admin who performed the action
          
          const adminNotifRef = db.collection('notifications').doc();
          batch.set(adminNotifRef, {
            recipientId: adminDoc.id,
            senderId: adminProfile.id,
            senderName: 'System Security',
            title: 'Admin Action: Password Reset',
            message: `Admin ${adminProfile.name} initiated a password reset for ${userToReset.name} ${userToReset.surname} (${userToReset.email}).`,
            type: 'password_change',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            read: false,
          });
        });
        await batch.commit();
      }

      addNotification(`Password reset email sent successfully to ${userToReset.email}.`, 'success');
      setStatus('success');
      setTimeout(() => {
        onClose();
        setStatus('idle');
      }, 1500);
    } catch (error: any) {
      console.error("Error sending password reset email:", error);
      addNotification(error.message || 'Failed to send password reset email.', 'error');
      setStatus('idle');
    }
  };

  const getButtonText = () => {
    switch (status) {
      case 'loading': return 'Sending...';
      case 'success': return 'Link Sent!';
      default: return 'Send Reset Link';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Reset Password for ${userToReset.name}`}>
      <div className="mb-6 p-4 bg-sky-900/50 border border-sky-700 rounded-md flex items-start text-sm text-sky-200">
        <Info size={24} className="mr-3 flex-shrink-0" />
        <div>
          This action will send a secure password reset link to the user's email address:
          <strong className="block text-white mt-1">{userToReset.email}</strong>
          <p className="mt-2 text-xs text-sky-300">This is the standard, secure method for account recovery. The user will be able to set their own new password.</p>
        </div>
      </div>
      <div className="flex justify-end space-x-4">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
        <button onClick={handleSendResetEmail} disabled={status !== 'idle'} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:bg-sky-800">
          {getButtonText()}
        </button>
      </div>
    </Modal>
  );
};

export default ResetPasswordModal;
