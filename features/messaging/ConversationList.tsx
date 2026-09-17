import React from 'react';
import { ChatConversation } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { CheckCheck } from 'lucide-react';

interface ConversationListProps {
  conversations: ChatConversation[];
  activeChatId?: string;
  onSelectConversation: (chatId: string) => void;
}

const ConversationList: React.FC<ConversationListProps> = ({ conversations, activeChatId, onSelectConversation }) => {
    const { userProfile } = useAuth();
    if (!userProfile) return null;

    const formatTimestamp = (timestamp: any) => {
        if (!timestamp?.toDate) return '';
        const date = timestamp.toDate();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        if (messageDate.getTime() === today.getTime()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        if (messageDate.getTime() === yesterday.getTime()) {
            return 'Yesterday';
        }
        return date.toLocaleDateString();
    };


    return (
        <div className="flex-1 overflow-y-auto">
            {conversations.map(convo => {
                const otherParticipantId = convo.participants.find(p => p !== userProfile.id);
                if (!otherParticipantId) return null;

                const otherUserProfile = convo.participantProfiles[otherParticipantId];
                const otherUserName = otherUserProfile ? `${otherUserProfile.name} ${otherUserProfile.surname}` : 'Unknown User';
                const otherUserRole = otherUserProfile?.role;

                const lastMessage = convo.lastMessage;
                const isLastMessageFromMe = lastMessage?.senderId === userProfile.id;
                const unreadCount = convo.unreadCounts ? convo.unreadCounts[userProfile.id] : 0;

                return (
                    <div
                        key={convo.id}
                        className={`conversation-item ${convo.id === activeChatId ? 'bg-sky-800' : ''}`}
                        onClick={() => onSelectConversation(convo.id)}
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="font-semibold text-white truncate">{otherUserName}</p>
                                {otherUserRole && (
                                    <p className="text-xs text-gray-400">{otherUserRole}</p>
                                )}
                            </div>
                            {unreadCount > 0 && <span className="message-badge">{unreadCount}</span>}
                        </div>
                        <div className="conversation-meta">
                            <p className={`text-sm truncate pr-2 ${unreadCount > 0 ? 'text-white font-semibold' : 'text-gray-400'}`}>
                              {isLastMessageFromMe && 'You: '}{lastMessage?.text || 'No messages yet...'}
                            </p>
                            <div className="flex items-center gap-1.5 flex-shrink-0 text-xs text-gray-500">
                                <span>{formatTimestamp(lastMessage?.timestamp)}</span>
                                {isLastMessageFromMe && lastMessage && (
                                    <span className={`message-ticks-list ${lastMessage.read ? 'read' : ''}`} title={lastMessage.read ? 'Read' : 'Delivered'}>
                                        <CheckCheck size={16} />
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ConversationList;