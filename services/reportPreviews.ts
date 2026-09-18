import type firebase from 'firebase/compat/app';
import { dateQuery } from './lowReadQueries';
import { cachedRead } from './readCache';
import { firestoreReadError } from './firestoreReadError';
import { db } from './firebase';
import { Bill, Patient, InventoryItem } from '../types';

type Range = { start: Date; end: Date } | null;

async function readPages(query: firebase.firestore.Query) {
    const documents: firebase.firestore.QueryDocumentSnapshot[] = [];
    let cursor: firebase.firestore.QueryDocumentSnapshot | undefined;
    while (true) {
        let pageQuery = query.limit(250);
        if (cursor) pageQuery = pageQuery.startAfter(cursor);
        const page = await pageQuery.get();
        documents.push(...page.docs);
        if (page.docs.length < 250) return documents;
        cursor = page.docs[page.docs.length - 1];
    }
}

const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const money = (value: unknown) => `$${amount(value).toFixed(2)}`;
const inRange = (value: unknown, range: Range) => {
    if (!range) return true;
    const timestamp = value as { toDate?: () => Date } | null;
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(value as string);
    return date >= range.start && date <= range.end;
};

/** Shared, paginated reads populate every preview without composite indexes. */
export async function reportPreviews(range: Range) {
    const [billResult, patientResult, inventoryResult] = await Promise.allSettled([
        cachedRead(`preview:bills:${JSON.stringify(range)}`, () => readPages(dateQuery('bills', 'date', range)), 300_000),
        cachedRead('preview:patients', () => readPages(db.collection('patients')), 300_000),
        cachedRead('preview:inventory', () => readPages(db.collection('inventory')), 300_000),
    ]);
    const result: Record<string, any> = {};
    const failed = (failure: PromiseRejectedResult, keys: string[]) => {
        for (const key of keys) result[key] = { error: firestoreReadError(failure.reason).message };
    };
    const bills = billResult.status === 'fulfilled' ? billResult.value.map(doc => doc.data() as Bill) : [];
    const patients = patientResult.status === 'fulfilled' ? patientResult.value.map(doc => ({ ...doc.data(), id: doc.id } as Patient)) : [];
    const inventory = inventoryResult.status === 'fulfilled' ? inventoryResult.value.map(doc => doc.data() as InventoryItem) : [];

    if (billResult.status === 'fulfilled') {
        result.paid_invoices = bills.filter(bill => bill.status === 'Paid').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 4).map(bill => ({ patientName: bill.patientName, total: money(bill.totalBill) }));
        result.partially_paid_invoices = bills.filter(bill => bill.status === 'Partially Paid').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 4).map(bill => ({ patientName: bill.patientName, balance: money(bill.balance) }));
        const totals = new Map<string, { quantity: number; totalValue: number }>();
        for (const bill of bills) for (const item of bill.items || []) {
            const total = totals.get(item.description) || { quantity: 0, totalValue: 0 };
            total.quantity += amount(item.quantity);
            total.totalValue += amount(item.totalPrice);
            totals.set(item.description, total);
        }
        result.top_selling_items = [...totals].sort(([, a], [, b]) => b.quantity - a.quantity).slice(0, 4).map(([name, total]) => ({ name, ...total }));
        result.patients_served = { 'Total Unique Patients Served': new Set(bills.map(bill => bill.patientId).filter(Boolean)).size };
    } else failed(billResult, ['paid_invoices', 'partially_paid_invoices', 'top_selling_items', 'patients_served']);

    if (patientResult.status === 'fulfilled') {
        result.patient_census = {
            'Total Registered Patients': patients.length,
            'Currently Admitted': patients.filter(patient => patient.status === 'Admitted').length,
            'Pending Discharge': patients.filter(patient => patient.status === 'PendingDischarge').length,
            'Total Discharged': patients.filter(patient => patient.status === 'Discharged').length,
        };
        result.debtors = patients.filter(patient => amount(patient.financials?.balance) > 0).sort((a, b) => amount(b.financials?.balance) - amount(a.financials?.balance)).slice(0, 4).map(patient => ({ name: `${patient.name} ${patient.surname}`, balance: money(patient.financials?.balance) }));
        result.admissions = patients.filter(patient => inRange(patient.registrationDate, range)).sort((a, b) => new Date(b.registrationDate).getTime() - new Date(a.registrationDate).getTime()).slice(0, 4).map(patient => ({ name: `${patient.name} ${patient.surname}`, registrationDate: patient.registrationDate }));
    } else failed(patientResult, ['patient_census', 'debtors', 'admissions']);

    if (billResult.status === 'fulfilled' && patientResult.status === 'fulfilled') {
        result.financial_summary = {
            'Total Sales': money(bills.reduce((total, bill) => total + amount(bill.totalBill), 0)),
            'Total Outstanding': money(patients.reduce((total, patient) => total + amount(patient.financials?.balance), 0)),
        };
    } else failed(billResult.status === 'rejected' ? billResult : patientResult as PromiseRejectedResult, ['financial_summary']);

    if (billResult.status === 'fulfilled' && inventoryResult.status === 'fulfilled') {
        const names = new Set(inventory.map(item => item.name));
        const items = bills.flatMap(bill => bill.items || []).filter(item => names.has(item.description));
        result.stock_report = {
            'Stock Received (Units)': inventory.filter(item => inRange(item.createdAt, range)).reduce((total, item) => total + amount(item.quantity), 0),
            'Stock Sold (Units)': items.reduce((total, item) => total + amount(item.quantity), 0),
            'Revenue from Stock ($)': money(items.reduce((total, item) => total + amount(item.totalPrice), 0)),
        };
    } else failed(billResult.status === 'rejected' ? billResult : inventoryResult as PromiseRejectedResult, ['stock_report']);
    return result;
}
