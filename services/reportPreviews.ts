import { aggregateRecords, countRecords, dateQuery, dashboardCounts } from './lowReadQueries';
import { cachedRead } from './readCache';
import { db } from './firebase';
import { Bill, Patient } from '../types';

export async function reportPreviews(range: { start: Date; end: Date } | null, detailed: string[]) {
    const bounds: any = range ? [['date', '>=', range.start.toISOString()], ['date', '<=', range.end.toISOString()]] : [];
    const [bills, patients, counts, inventory, debtors, paid, partial, admissions] = await Promise.all([
        aggregateRecords('bills', { total: 'totalBill', pharmacyQuantity: 'pharmacyQuantity', pharmacyTotal: 'pharmacyTotal' }, bounds),
        aggregateRecords('patients', { balance: 'financials.balance' }), dashboardCounts(),
        aggregateRecords('inventory', { received: 'totalStockReceived', quantity: 'quantity', value: 'stockValue' }),
        cachedRead('preview:debtors', () => db.collection('patients').where('financials.balance', '>', 0).orderBy('financials.balance', 'desc').limit(4).get()),
        cachedRead(`preview:paid:${JSON.stringify(bounds)}`, () => dateQuery('bills', 'date', range).where('status', '==', 'Paid').orderBy('date', 'desc').limit(4).get()),
        cachedRead(`preview:partial:${JSON.stringify(bounds)}`, () => dateQuery('bills', 'date', range).where('status', '==', 'Partially Paid').orderBy('date', 'desc').limit(4).get()),
        cachedRead(`preview:admissions:${JSON.stringify(bounds)}`, () => dateQuery('patients', 'registrationDate', range).orderBy('registrationDate', 'desc').limit(4).get()),
    ]);
    const result: Record<string, any> = {
        financial_summary: { 'Total Sales': `$${bills.total.toFixed(2)}`, 'Total Outstanding': `$${patients.balance.toFixed(2)}` },
        patient_census: { 'Admitted Patients': counts.admitted, 'Total Patients': counts.totalPatients },
        stock_report: { 'Stock Received': inventory.received, 'Stock Billed': bills.pharmacyQuantity, 'Billed Value': `$${bills.pharmacyTotal.toFixed(2)}` },
        debtors: debtors.docs.map(doc => { const p = doc.data() as Patient; return { name: `${p.name} ${p.surname}`, balance: `$${p.financials.balance.toFixed(2)}` }; }),
        paid_invoices: paid.docs.map(doc => ({ patientName: doc.data().patientName, total: `$${doc.data().totalBill.toFixed(2)}` })),
        partially_paid_invoices: partial.docs.map(doc => ({ patientName: doc.data().patientName, balance: `$${doc.data().balance.toFixed(2)}` })),
        admissions: admissions.docs.map(doc => ({ name: `${doc.data().name} ${doc.data().surname}`, date: new Date(doc.data().registrationDate).toLocaleDateString() })),
        top_selling_items: { deferred: true }, patients_served: { deferred: true },
    };
    if (detailed.length) {
        const snapshot = await cachedRead(`preview:bill-detail:${JSON.stringify(bounds)}`, () => dateQuery('bills', 'date', range).get(), 300_000);
        const bills = snapshot.docs.map(doc => doc.data() as Bill);
        if (detailed.includes('top_selling_items')) {
            const totals: Record<string, number> = {};
            bills.forEach(bill => bill.items.forEach(item => { totals[item.description] = (totals[item.description] || 0) + item.quantity; }));
            result.top_selling_items = Object.entries(totals).sort(([, a], [, b]) => b - a).slice(0, 4).map(([name, quantity]) => ({ name, quantity }));
        }
        if (detailed.includes('patients_served')) result.patients_served = { 'Unique Patients': new Set(bills.map(bill => bill.patientId)).size };
    }
    return result;
}
