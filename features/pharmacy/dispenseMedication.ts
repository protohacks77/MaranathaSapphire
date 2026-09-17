import firebase from 'firebase/compat/app';
import { db } from '../../services/firebase';
import { Role, UserProfile } from '../../types';

export interface DispenseInput {
    itemId: string;
    quantity: number;
    recipientPatientId: string;
    recipientName: string;
    recipientHospitalNumber: string;
    notes: string;
}

export async function dispenseMedication(input: DispenseInput, user: UserProfile) {
    if (![Role.Pharmacist, Role.PharmacyTechnician, Role.DispensaryAssistant, Role.Admin].includes(user.role)) {
        throw new Error('You do not have permission to dispense medication.');
    }
    if (!input.recipientPatientId?.trim()) throw new Error('Select a registered patient.');
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error('Enter a positive whole-number quantity.');
    const patientRef = db.collection('patients').doc(input.recipientPatientId);
    const inventoryRef = db.collection('inventory').doc(input.itemId);
    const dispensingRef = db.collection('dispensingRecords').doc();
    const logRef = db.collection('inventoryLogs').doc();
    await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(inventoryRef);
        if (!snapshot.exists) throw new Error('This medication is no longer in stock.');
        const patientSnapshot = await transaction.get(patientRef);
        if (!patientSnapshot.exists) throw new Error('The selected patient no longer exists. Please select another patient.');
        const patient = patientSnapshot.data()!;
        const item = snapshot.data()!;
        if (!Number.isSafeInteger(item.quantity) || item.quantity < input.quantity) throw new Error('Insufficient stock. Refresh inventory and check the available quantity.');
        const newQuantity = item.quantity - input.quantity;
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        const recipientName = `${patient.name} ${patient.surname}`.trim();
        const recipientHospitalNumber = patient.hospitalNumber;
        const userName = `${user.name} ${user.surname}`;
        transaction.update(inventoryRef, { quantity: newQuantity, stockValue: newQuantity * (item.unitPrice ?? 0), isLowStock: newQuantity <= (item.lowStockThreshold ?? 0), updatedAt: timestamp });
        transaction.set(dispensingRef, {
            itemId: inventoryRef.id, itemName: item.name, quantity: input.quantity,
            recipientPatientId: patientRef.id, recipientName, recipientHospitalNumber, notes: input.notes.trim(),
            dispensedById: user.id, dispensedByName: userName, timestamp,
        });
        transaction.set(logRef, {
            itemId: inventoryRef.id, itemName: item.name, type: 'Dispense',
            changeAmount: -input.quantity, previousQuantity: item.quantity, newQuantity,
            recipientPatientId: patientRef.id, recipientName, recipientHospitalNumber, userId: user.id, userName,
            notes: input.notes.trim(), timestamp,
        });
    });
}
