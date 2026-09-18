import { getLastDataChangeAt } from './offlineStatus';
import { recordDate } from '../features/patients/recordTimestamp';
import firebase from 'firebase/compat/app';
import { getFirestore, collection, query, where, getCountFromServer, getAggregateFromServer, sum, count } from 'firebase/firestore';
import { db } from './firebase';
import { cachedRead } from './readCache';

export const PAGE_SIZE = 25;
export type Filters = Array<[string, firebase.firestore.WhereFilterOp, any]>;
export function filteredQuery(path: string, filters: Filters = []) {
    return filters.reduce((result, [field, operation, value]) => result.where(field, operation, value), db.collection(path) as firebase.firestore.Query);
}
export function dateQuery(path: string, field: string, range: { start: Date; end: Date } | null) {
    return filteredQuery(path, range ? [[field, '>=', range.start.toISOString()], [field, '<=', range.end.toISOString()]] : []);
}
export function countRecords(path: string, filters: Filters = []) {
    return cachedRead(`count:${path}:${JSON.stringify(filters)}`, async () => {
        const result = await getCountFromServer(query(collection(getFirestore(), path), ...filters.map(([field, operation, value]) => where(field, operation, value))));
        return result.data().count;
    });
}
export function aggregateRecords(path: string, fields: Record<string, string>, filters: Filters = []) {
    return cachedRead(`aggregate:${path}:${JSON.stringify(fields)}:${JSON.stringify(filters)}`, async () => {
        const specification = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field === '__count' ? count() : sum(field)]));
        const result = await getAggregateFromServer(query(collection(getFirestore(), path), ...filters.map(([field, operation, value]) => where(field, operation, value))), specification);
        return result.data() as Record<string, number>;
    });
}
export async function storedSummary<T>(path: string, build: () => Promise<T>, ttl = 300_000): Promise<T> {
    const cached = await cachedRead<{ value: T; expiresAt: number }>(`summary:${path}`, async () => {
        const reference = db.doc(path);
        const snapshot = await reference.get();
        const data = snapshot.data();
        if (((data?.expiresAt > Date.now() && (recordDate(data?.updatedAt)?.getTime() || 0) >= getLastDataChangeAt()) || !navigator.onLine) && data?.value) return { value: data.value as T, expiresAt: data.expiresAt };
        const value = await build();
        const expiresAt = Date.now() + ttl;
        // Display summaries never authorize financial or stock decisions.
        await reference.set({ value, expiresAt, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
        return { value, expiresAt };
    }, result => Math.max(0, result.expiresAt - Date.now()));
    return cached.value;
}
export const patientSections: Record<string, string[]> = {
    clinical: ['doctorNotes', 'nurseNotes'], vitals: ['vitals'], prescriptions: ['prescriptions'], labs: ['labResults'],
    radiology: ['radiologyResults'], rehab: ['rehabilitationNotes'], discharge: ['dischargeSummaries'], admissions: ['admissionHistory'],
};
export async function patientRecordCounts(patientId: string) {
    return storedSummary<Record<string, number>>(`patients/${patientId}/summaries/records`, async () => {
        const counts = await Promise.all(Object.entries(patientSections).map(async ([tab, sections]) => [tab,
            (await Promise.all(sections.map(section => countRecords(`patients/${patientId}/${section}`)))).reduce((a, b) => a + b, 0)] as const));
        const [dispensed, bills, payments] = await Promise.all([
            countRecords('dispensingRecords', [['recipientPatientId', '==', patientId]]),
            countRecords('bills', [['patientId', '==', patientId]]), countRecords('payments', [['patientId', '==', patientId]]),
        ]);
        return { ...Object.fromEntries(counts), dispensed, financials: bills + payments };
    });
}

export function dashboardCounts() {
    return storedSummary('summaries/dashboard', async () => {
        const [totalUsers, totalPatients, admitted, pendingDischarge, lowStock] = await Promise.all([
            countRecords('users'), countRecords('patients'), countRecords('patients', [['status', '==', 'Admitted']]),
            countRecords('patients', [['status', '==', 'PendingDischarge']]), countRecords('inventory', [['isLowStock', '==', true]]),
        ]);
        return { totalUsers, totalPatients, admitted, pendingDischarge, lowStock };
    }, 60_000);
}
export function financialSummary(start: string, end: string) {
    return storedSummary(`summaries/financial-${start.slice(0, 7)}`, async () => {
        const [bills, payments, patients] = await Promise.all([
            aggregateRecords('bills', { total: 'totalBill' }, [['date', '>=', start], ['date', '<=', end]]),
            aggregateRecords('payments', { total: 'amount' }, [['date', '>=', start], ['date', '<=', end]]),
            aggregateRecords('patients', { total: 'financials.balance' }),
        ]);
        return { monthlySales: bills.total, monthlyPaid: payments.total, totalUnpaid: patients.total };
    }, 60_000);
}
