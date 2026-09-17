import { ensureInboxSummary, inboxReference } from '../../services/inboxSummary';

import React, { useState, useRef } from 'react';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import firebase from 'firebase/compat/app';
import { Send, Paperclip, Image as ImageIcon } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { ChatConversation } from '../../types';

interface MessageInputProps {
  chatId: string;
}

const MessageInput: React.FC<MessageInputProps> = ({ chatId }) => {
  const [text, setText] = useState('');
  const { userProfile } = useAuth();
  const { addNotification } = useNotification();
  const [isSending, setIsSending] = useState(false);
  
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);


  const sendMessage = async (messageText: string, attachment: any = null) => {
    if (!userProfile) return;
    setIsSending(true);

    try {
        // Offline-Friendly Change: switched from runTransaction to batch.
        // Transactions require server connectivity to guarantee consistency.
        // Batches work with the local cache immediately and sync later.
        const chatRef = db.collection('chats').doc(chatId);
        const messageRef = chatRef.collection('messages').doc();
        const batch = db.batch();

        // We must read the chat doc first to get participants. 
        // This works offline if the chat was previously loaded (cached).
        const chatDoc = await chatRef.get();
        if (!chatDoc.exists) throw new Error("Chat does not exist.");

        const chatData = chatDoc.data() as ChatConversation;
        const otherParticipantId = chatData.participants.find(p => p !== userProfile.id);
        if (!otherParticipantId) throw new Error("Recipient not found in chat.");
        
        const messageData: any = {
            chatId,
            senderId: userProfile.id,
            senderName: `${userProfile.name} ${userProfile.surname}`,
            text: messageText,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            read: false,
        };

        if (attachment) messageData.attachment = attachment;
        
        batch.set(messageRef, messageData);
        
        const lastMessage = {
            id: messageRef.id,
            text: attachment ? `Attachment: ${attachment.name}` : messageText,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            senderId: userProfile.id,
            read: false,
        };

        await ensureInboxSummary(otherParticipantId);
        batch.update(chatRef, {
            lastMessage,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            [`unreadCounts.${otherParticipantId}`]: firebase.firestore.FieldValue.increment(1),
        });
        batch.set(inboxReference(otherParticipantId), { unreadMessages: firebase.firestore.FieldValue.increment(1) }, { merge: true });

        const notificationRef = db.collection('notifications').doc();
        batch.set(notificationRef, {
            recipientId: otherParticipantId,
            senderId: userProfile.id,
            senderName: `${userProfile.name} ${userProfile.surname}`,
            title: `New message from ${userProfile.name}`,
            message: messageText.substring(0, 100), // Truncate for notification
            type: 'message',
            link: `/messages/${chatId}`,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            read: false,
        });

        await batch.commit();

    } catch (error) {
        console.error("Error sending message:", error);
        addNotification('Failed to send message. Ensure you are connected or chat is loaded.', 'error');
    } finally {
        setIsSending(false);
    }
  };


  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const messageText = text.trim();
    if (messageText) {
      sendMessage(messageText);
      setText('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'document') => {
      const file = e.target.files?.[0];
      if (file) {
          addNotification('File uploads are not yet enabled.', 'info');
          const attachment = {
              name: file.name,
              type,
              url: 'placeholder_url'
          }
          sendMessage(`Attached: ${file.name}`, attachment);
          e.target.value = ''; 
      }
  };

  return (
    <div className="chat-input-area bg-[#161B22]">
      <form onSubmit={handleSend} className="flex items-center gap-2">
        <input type="file" ref={imageInputRef} onChange={(e) => handleFileChange(e, 'image')} accept="image/*" className="hidden" />
        <input type="file" ref={docInputRef} onChange={(e) => handleFileChange(e, 'document')} className="hidden" />

        <button type="button" onClick={() => imageInputRef.current?.click()} className="p-2 text-gray-400 hover:text-sky-500 rounded-full hover:bg-gray-700 transition-colors">
            <ImageIcon size={20} />
        </button>
        <button type="button" onClick={() => docInputRef.current?.click()} className="p-2 text-gray-400 hover:text-sky-500 rounded-full hover:bg-gray-700 transition-colors">
            <Paperclip size={20} />
        </button>
        
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
              }
          }}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 px-4 py-2 bg-gray-800 border border-gray-600 rounded-full text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
          style={{ maxHeight: '100px' }}
        />
        <button type="submit" disabled={isSending || !text.trim()} className="p-3 bg-sky-600 text-white rounded-full hover:bg-sky-700 disabled:bg-sky-800 disabled:cursor-not-allowed transition-colors">
          <Send size={20} />
        </button>
      </form>
    </div>
  );
};

export default MessageInput;
