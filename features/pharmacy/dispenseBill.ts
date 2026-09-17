import firebase from 'firebase/compat/app';
import { db } from '../../services/firebase';
import { Bill, InventoryItem, Role, UserProfile } from '../../types';
import { billedMedicationLines, dispensingProblem } from './billedMedication';

export async function dispenseBill(billId: string, inventory: InventoryItem[], user: UserProfile) {
    if (![Role.Pharmacist, Role.PharmacyTechnician, Role.DispensaryAssistant, Role.Admin].includes(user.role)) throw new Error('You do not have permission to dispense medication.');
    const billRef = db.collection('bills').doc(billId);
    await db.runTransaction(async transaction => {
        const billSnapshot = await transaction.get(billRef);
        if (!billSnapshot.exists) throw new Error('This bill no longer exists.');
        const bill = billSnapshot.data() as Bill;
        const lines = billedMedicationLines(bill, inventory).filter(line => line.remaining > 0);
        if (!lines.length) throw new Error('This bill has no medication awaiting dispensing.');
        if (lines.length > 100) throw new Error('This bill has too many medication lines to dispense together.');
        if (lines.some(line => !line.inventoryItemId)) throw new Error('A billed medication is missing from inventory. Restock before dispensing.');
        const patientRef = db.collection('patients').doc(bill.patientId);
        const patientSnapshot = await transaction.get(patientRef);
        if (!patientSnapshot.exists) throw new Error('The patient on this bill no longer exists.');
        const patient = patientSnapshot.data()!;
        const itemIds = [...new Set(lines.map(line => line.inventoryItemId!))];
        const stockSnapshots = await Promise.all(itemIds.map(id => transaction.get(db.collection('inventory').doc(id))));
        const currentInventory = stockSnapshots.map(snapshot => {
            if (!snapshot.exists) throw new Error('A billed medication is no longer in inventory.');
            return { ...snapshot.data(), id: snapshot.id } as InventoryItem;
        });
        for (const line of lines) {
            const stock = currentInventory.find(item => item.id === line.inventoryItemId)!;
            // Legacy bills use exact names; current bills store the inventory ID.
            if (!bill.items[line.index].inventoryItemId && stock.name !== line.name) throw new Error('The inventory match changed. Refresh the dashboard.');
            line.available = stock.quantity;
        }
        const problem = dispensingProblem(lines);
        if (problem) throw new Error(problem);
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        const quantities = { ...bill.dispensedQuantities };
        const totals = new Map<string, number>();
        const userName = `${user.name} ${user.surname}`;
        const recipientName = `${patient.name} ${patient.surname}`;
        for (const line of lines) {
            const stock = currentInventory.find(item => item.id === line.inventoryItemId)!;
            const alreadyTaken = totals.get(stock.id!) ?? 0;
            const previousQuantity = stock.quantity - alreadyTaken;
            totals.set(stock.id!, alreadyTaken + line.remaining);
            quantities[String(line.index)] = line.billed;
            const dispensingRef = db.collection('dispensingRecords').doc();
            transaction.set(dispensingRef, {
                billId, billItemIndex: line.index, itemId: stock.id, itemName: stock.name, quantity: line.remaining,
                recipientPatientId: patientRef.id, recipientName, recipientHospitalNumber: patient.hospitalNumber,
                dispensedById: user.id, dispensedByName: userName, timestamp, notes: 'Dispensed against billed medication',
            });
            transaction.set(db.collection('inventoryLogs').doc(), {
                billId, billItemIndex: line.index, itemId: stock.id, itemName: stock.name, type: 'Dispense',
                changeAmount: -line.remaining, previousQuantity, newQuantity: previousQuantity - line.remaining,
                recipientPatientId: patientRef.id, recipientName, recipientHospitalNumber: patient.hospitalNumber,
                userId: user.id, userName, timestamp, notes: 'Dispensed against billed medication',
            });
        }
        for (const [itemId, total] of totals) {
            const stock = currentInventory.find(item => item.id === itemId)!;
            transaction.update(db.collection('inventory').doc(itemId), { quantity: stock.quantity - total, stockValue: (stock.quantity - total) * (stock.unitPrice ?? 0), isLowStock: stock.quantity - total <= (stock.lowStockThreshold ?? 0), updatedAt: timestamp });
        }
        transaction.update(billRef, { dispensedQuantities: quantities, dispensingStatus: 'Complete', lastDispensedAt: timestamp, lastDispensedBy: user.id });
    });
}
