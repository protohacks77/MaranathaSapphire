import { Bill, Payment, Patient } from '../types';

const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;


/** Accept current Firestore timestamps and older imported date values. */
export function reportDate(value: unknown): Date | null {
    if (value === null || value === undefined || value === '') return null;
    try {
        const timestamp = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
        const seconds = timestamp.seconds ?? timestamp._seconds;
        const date = typeof timestamp.toDate === 'function' ? timestamp.toDate()
            : typeof seconds === 'number' ? new Date(seconds * 1000)
            : new Date(value as string);
        return Number.isFinite(date.getTime()) ? date : null;
    } catch { return null; }
}

export function reportDateInRange(value: unknown, range: { start: Date; end: Date } | null): boolean {
    if (!range) return true;
    const date = reportDate(value);
    return !!date && date >= range.start && date <= range.end;
}

export function financialReportSummary(bills: Bill[], payments: Payment[], patients: Patient[]) {
    return {
        'Total Sales': bills.reduce((total, bill) => total + amount(bill.totalBill), 0),
        'Cash Received': payments.filter(payment => payment.paymentMethod === 'CASH').reduce((total, payment) => total + amount(payment.amount), 0),
        'EFT Received': payments.filter(payment => payment.paymentMethod === 'EFT').reduce((total, payment) => total + amount(payment.amount), 0),
        'Total Outstanding Balance': patients.reduce((total, patient) => total + amount(patient.financials?.balance), 0),
    };
}

export function reportCellText(value: unknown, header: string, accessor = ''): string {
    if (value === null || value === undefined) return '—';
    if (accessor === 'isLow') return value ? 'Low Stock' : 'OK';
    if (/date/i.test(accessor) || accessor === 'createdAt') {
        return reportDate(value)?.toLocaleDateString() ?? '—';
    }
    if (typeof value === 'number') {
        // Unit counts such as Stock Received must remain counts.
        const currency = /\(\$\)|sales|balance|outstanding|revenue|value|cash received|eft received/i.test(header);
        return currency ? `$${value.toFixed(2)}` : value.toLocaleString();
    }
    return String(value);
}
