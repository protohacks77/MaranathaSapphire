import { Bill, Payment, Patient } from '../types';

const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;

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
        const timestamp = value as { toDate?: () => Date };
        const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(value as string);
        return isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
    }
    if (typeof value === 'number') {
        // Unit counts such as Stock Received must remain counts.
        const currency = /\(\$\)|sales|balance|outstanding|revenue|value|cash received|eft received/i.test(header);
        return currency ? `$${value.toFixed(2)}` : value.toLocaleString();
    }
    return String(value);
}
