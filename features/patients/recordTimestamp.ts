export function recordDate(value: any): Date | null {
    if (value == null || value === '') return null;
    try {
        const seconds = value.seconds ?? value._seconds;
        const date = value instanceof Date ? value
            : typeof value.toDate === 'function' ? value.toDate()
            : typeof seconds === 'number' ? new Date(seconds * 1000 + (value.nanoseconds ?? value._nanoseconds ?? 0) / 1e6)
            : typeof value === 'string' || typeof value === 'number' ? new Date(value)
            : null;
        return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
    } catch {
        return null;
    }
}

export function formatRecordTimestamp(value: any): string {
    return recordDate(value)?.toLocaleString('en-GB', {
        timeZone: 'Africa/Harare', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }) ?? 'Timestamp unavailable';
}

export function newestRecordFirst(a: { createdAt: any }, b: { createdAt: any }): number {
    return (recordDate(b.createdAt)?.getTime() ?? 0) - (recordDate(a.createdAt)?.getTime() ?? 0);
}

export function formatRecordDate(value: any): string {
    return recordDate(value)?.toLocaleDateString('en-GB', {
        timeZone: 'Africa/Harare', day: '2-digit', month: 'short', year: 'numeric',
    }) ?? 'Timestamp unavailable';
}

export function formatRecordTime(value: any): string {
    return recordDate(value)?.toLocaleTimeString('en-GB', {
        timeZone: 'Africa/Harare', hour: '2-digit', minute: '2-digit', hour12: false,
    }) ?? '';
}
