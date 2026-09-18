import firebase from 'firebase/compat/app';
import { auth, db } from '../../services/firebase';
import { Role } from '../../types';

export interface InventoryResetPreview {
    inventory: number;
    inventoryLogs: number;
    dispensingRecords: number;
    pharmacyPrices: number;
    bills: number;
    payments: number;
    patients: number;
}

async function requireAdmin() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('Connect to the internet before resetting inventory.');
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in as an administrator to reset inventory.');
    const profile = await db.collection('users').doc(user.uid).get();
    if (profile.data()?.role !== Role.Admin) throw new Error('Only administrators can reset inventory.');
    return user.uid;
}

async function loadResetData(includeFinances: boolean) {
    const [inventory, inventoryLogs, dispensingRecords, pharmacyPrices, bills, payments, patients] = await Promise.all([
        db.collection('inventory').get(),
        db.collection('inventoryLogs').get(),
        db.collection('dispensingRecords').get(),
        db.collection('priceList').where('department', '==', 'Pharmacy').get(),
        includeFinances ? db.collection('bills').get() : null,
        includeFinances ? db.collection('payments').get() : null,
        includeFinances ? db.collection('patients').get() : null,
    ]);
    return { inventory, inventoryLogs, dispensingRecords, pharmacyPrices, bills, payments, patients };
}

export async function previewInventoryReset(includeFinances: boolean): Promise<InventoryResetPreview> {
    await requireAdmin();
    const data = await loadResetData(includeFinances);
    return Object.fromEntries(Object.entries(data).map(([key, snapshot]) => [key, snapshot?.size ?? 0])) as unknown as InventoryResetPreview;
}

export async function resetInventory(includeFinances: boolean, confirmation: string, onProgress: (done: number, total: number) => void) {
    if (confirmation !== 'RESET INVENTORY') throw new Error('Type RESET INVENTORY to confirm.');
    const adminId = await requireAdmin();
    const data = await loadResetData(includeFinances);
    const operations: Array<(batch: firebase.firestore.WriteBatch) => void> = [];
    for (const snapshot of [data.inventory, data.inventoryLogs, data.dispensingRecords, data.pharmacyPrices, data.bills, data.payments]) {
        snapshot?.docs.forEach(document => operations.push(batch => batch.delete(document.ref)));
    }
    data.patients?.docs.forEach(document => operations.push(batch => batch.update(document.ref, {
        financials: { totalBill: 0, amountPaid: 0, balance: 0 },
    })));
    const audit = db.collection('adminResetLogs').doc();
    await audit.set({ adminId, includeFinances, status: 'running', startedAt: firebase.firestore.FieldValue.serverTimestamp(), totalOperations: operations.length });
    let completed = 0;
    try {
        onProgress(0, operations.length);
        for (let offset = 0; offset < operations.length; offset += 400) {
            const batch = db.batch();
            const chunk = operations.slice(offset, offset + 400);
            chunk.forEach(operation => operation(batch));
            batch.update(audit, { completedOperations: completed + chunk.length });
            await batch.commit();
            completed += chunk.length;
            onProgress(completed, operations.length);
        }
        await audit.update({ status: 'complete', finishedAt: firebase.firestore.FieldValue.serverTimestamp() });
    } catch {
        await audit.update({ status: 'failed', completedOperations: completed }).catch(() => {});
        throw new Error(`Reset stopped after ${completed} of ${operations.length} changes. Some data may already be cleared. Review the remaining records and retry.`);
    }
}
