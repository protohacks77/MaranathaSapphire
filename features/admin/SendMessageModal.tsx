
import React, { useState } from 'react';
import Modal from '../../components/utils/Modal';
import { useNotification } from '../../context/NotificationContext';
import { db } from '../../services/firebase';
import { UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import firebase from 'firebase/compat/app';

interface SendMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipient: UserProfile;
}

const SendMessageModal: React.FC<SendMessageModalProps> = ({ isOpen, onClose, recipient }) => {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const { addNotification } = useNotification();
  const { userProfile } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      addNotification('Message cannot be empty.', 'warning');
      return;
    }
    if (!userProfile) {
      addNotification('Could not identify sender.', 'error');
      return;
    }
    setStatus('loading');
    try {
      await db.collection('notifications').add({
        recipientId: recipient.id,
        senderId: userProfile.id,
        senderName: `${userProfile.name} ${userProfile.surname} (${userProfile.role})`,
        title: `New Message from ${userProfile.name}`,
        message,
        type: 'message',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        read: false,
      });
      addNotification('Message sent successfully!', 'success');
      setStatus('success');
      setTimeout(() => {
        onClose();
        setStatus('idle');
      }, 1500);
    } catch (error) {
      console.error("Error sending message:", error);
      addNotification('Failed to send message.', 'error');
      setStatus('idle');
    }
  };

  const getButtonText = () => {
    switch (status) {
      case 'loading': return 'Sending...';
      case 'success': return 'Sent!';
      default: return 'Send Message';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Send Message to ${recipient.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          name="message"
          rows={4}
          placeholder="Type your message here..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white"
        />
        <div className="flex justify-end space-x-4 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
          <button type="submit" disabled={status !== 'idle'} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:bg-sky-800">
            {getButtonText()}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default SendMessageModal;
