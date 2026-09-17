import { db } from './firebase';
import firebase from 'firebase/compat/app';
import { cachedRead } from './readCache';

export const inboxReference = (userId: string) => db.doc(`users/${userId}/summaries/inbox`);
export function ensureInboxSummary(userId: string) {
    return cachedRead(`inbox-initialized:${userId}`, async () => {
        const reference = inboxReference(userId);
        if ((await reference.get()).exists) return;
        const chats = await db.collection('chats').where('participants', 'array-contains', userId).get();
        await db.runTransaction(async transaction => {
            if ((await transaction.get(reference)).exists) return;
            const current = await Promise.all(chats.docs.map(doc => transaction.get(doc.ref)));
            const unreadMessages = current.reduce((total, doc) => total + Number(doc.data()?.unreadCounts?.[userId] || 0), 0);
            transaction.set(reference, { unreadMessages });
        });
    }, 300_000);
}
export async function markConversationRead(chatId: string, userId: string) {
    await ensureInboxSummary(userId);
    const chat = db.collection('chats').doc(chatId);
    const summary = inboxReference(userId);
    await db.runTransaction(async transaction => {
        const [conversation, counter] = await Promise.all([transaction.get(chat), transaction.get(summary)]);
        const unread = Number(conversation.data()?.unreadCounts?.[userId] || 0);
        if (!unread) return;
        transaction.update(chat, { [`unreadCounts.${userId}`]: 0 });
        transaction.set(summary, { unreadMessages: Math.max(0, Number(counter.data()?.unreadMessages || 0) - unread) }, { merge: true });
    });
}
