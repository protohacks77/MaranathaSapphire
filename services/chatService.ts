import { db } from './firebase';
import { UserProfile } from '../types';
import firebase from 'firebase/compat/app';

/**
 * Generates a unique, consistent chat ID for two users.
 * @param uid1 - First user's ID
 * @param uid2 - Second user's ID
 * @returns A composite chat ID.
 */
const getChatId = (uid1: string, uid2: string): string => {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

/**
 * Checks if a chat exists between two users, and creates one if it doesn't.
 * @param currentUserId - The ID of the currently logged-in user.
 * @param otherUserId - The ID of the user to chat with.
 * @returns The chat ID for the conversation.
 */
export const getOrCreateChat = async (currentUserId: string, otherUserId: string): Promise<string> => {
  const chatId = getChatId(currentUserId, otherUserId);
  const chatRef = db.collection('chats').doc(chatId);
  const doc = await chatRef.get();

  if (!doc.exists) {
    try {
      // Fetch profiles to store names for easier display in conversation list
      const user1Doc = await db.collection('users').doc(currentUserId).get();
      const user2Doc = await db.collection('users').doc(otherUserId).get();

      if (!user1Doc.exists || !user2Doc.exists) {
        throw new Error("One or both users not found.");
      }
      const user1Profile = user1Doc.data() as UserProfile;
      const user2Profile = user2Doc.data() as UserProfile;

      await chatRef.set({
        participants: [currentUserId, otherUserId],
        participantProfiles: {
          [currentUserId]: {
            name: user1Profile.name,
            surname: user1Profile.surname,
            role: user1Profile.role,
          },
          [otherUserId]: {
            name: user2Profile.name,
            surname: user2Profile.surname,
            role: user2Profile.role,
          }
        },
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastMessage: null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        unreadCounts: {
            [currentUserId]: 0,
            [otherUserId]: 0,
        },
      });
    } catch (error) {
        console.error("Error creating chat document:", error);
        throw new Error("Could not create chat session.");
    }
  }

  return chatId;
};