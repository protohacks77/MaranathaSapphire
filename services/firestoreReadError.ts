export function firestoreReadError(error: unknown): { message: string; indexUrl: string } {
    const failure = error as { code?: string; message?: string } | null;
    const code = failure?.code?.replace(/^firestore\//, '');
    const text = failure?.message || '';
    const match = text.match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/);
    const indexUrl = match ? match[0] : '';
    if (code === 'failed-precondition' && (indexUrl || /index/i.test(text))) {
        return { message: 'The required database index is missing or still building. An administrator must finish database setup before these records can load.', indexUrl };
    }
    if (code === 'permission-denied') return { message: 'You do not have permission to view these records.', indexUrl: '' };
    if (code === 'unauthenticated') return { message: 'Your session has expired. Please sign in again.', indexUrl: '' };
    if (['unavailable', 'deadline-exceeded'].includes(code || '')) return { message: 'Cannot reach the database. Check your connection and retry.', indexUrl: '' };
    return { message: 'Could not load records. Please retry.', indexUrl: '' };
}
