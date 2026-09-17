import { formatRecordTimestamp as formatRecordTimestampForPrint } from './recordTimestamp';
import firebase from 'firebase/compat/app';
import { db } from '../../services/firebase';
import { ClerkingSheetData, Patient, Role, UserProfile } from '../../types';
import { invalidateReads } from '../../services/readCache';

export function canAddClerkingSheet(role?: Role) {
    return role !== undefined && [Role.Doctor, Role.Nurse, Role.Admin, Role.Accountant, Role.AccountsAssistant, Role.AccountsClerk].includes(role);
}

export const historyFields = [
    ['presentingComplaint', 'Presenting complaint'], ['history', 'History of presenting complaint'],
    ['medicalSurgicalHistory', 'Medical and surgical history'], ['familySocialHistory', 'Family and social history'],
    ['generalExamination', 'General examination'], ['chestExamination', 'Chest examination'],
    ['cardiovascularExamination', 'Cardiovascular examination'], ['abdomenGenitaliaExamination', 'Abdomen / genitalia examination'],
] as const;
export const measurementFields = [
    ['bloodPressure', 'Blood pressure', 'mmHg'], ['heartRate', 'Pulse', 'bpm'], ['temperature', 'Temperature', '°C'],
    ['respiratoryRate', 'Respiratory rate', '/min'], ['oxygenSaturation', 'Oxygen saturation', '%'],
    ['randomBloodSugar', 'Random blood sugar', 'mmol/L'], ['weight', 'Weight', 'kg'],
] as const;
export function initialClerkingSheet(patient: Patient): ClerkingSheetData {
    const presentationAt = new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Harare' }).slice(0, 16).replace(' ', 'T');
    return {
        patientName: `${patient.name} ${patient.surname}`, age: String(patient.age ?? ''), sex: patient.gender,
        phone: patient.phoneNumber || '', address: patient.residentialAddress || '', nextOfKinPhone: patient.nokPhoneNumber || '',
        medicalAid: patient.medicalAid || '', medicalAidNumber: patient.medicalAidNumber || '', presentationAt,
        presentingComplaint: '', history: '', medicalSurgicalHistory: '', familySocialHistory: '',
        generalExamination: '', chestExamination: '', cardiovascularExamination: '', abdomenGenitaliaExamination: '',
        bloodPressure: '', heartRate: '', temperature: '', respiratoryRate: '', oxygenSaturation: '', randomBloodSugar: '', weight: '',
    };
}
export async function saveClerkingSheet(patientId: string, data: ClerkingSheetData, author: UserProfile) {
    if (!canAddClerkingSheet(author.role)) throw new Error('You do not have permission to add a clerking sheet.');
    if (!patientId || !data.presentingComplaint.trim()) throw new Error('Enter the presenting complaint.');
    if (!data.presentationAt || !Number.isFinite(new Date(`${data.presentationAt}:00+02:00`).getTime())) throw new Error('Enter a valid presentation date and time.');
    for (const [field, label] of measurementFields) {
        if (field === 'bloodPressure' || !data[field].trim()) continue;
        const number = Number(data[field]);
        if (!Number.isFinite(number) || number <= 0 || (field === 'oxygenSaturation' && number > 100)) throw new Error(`Enter a valid ${label.toLowerCase()}.`);
    }
    const patientRef = db.collection('patients').doc(patientId);
    const noteRef = patientRef.collection(author.role === Role.Nurse ? 'nurseNotes' : 'doctorNotes').doc();
    const vitalsRef = patientRef.collection('vitals').doc();
    const hasVitals = measurementFields.some(([field]) => data[field].trim());
    await db.runTransaction(async transaction => {
        const patient = await transaction.get(patientRef);
        if (!patient.exists) throw new Error('This patient no longer exists.');
        const current = patient.data() as Patient;
        let admissionId: string | undefined;
        if (['Admitted', 'PendingDischarge'].includes(current.status)) {
            // A single current admission is read only when linking a new sheet.
            const admissions = await patientRef.collection('admissionHistory').orderBy('admissionDate', 'desc').limit(1).get();
            if (!admissions.empty) {
                const latest = await transaction.get(admissions.docs[0].ref);
                if (latest.exists && !latest.data()?.dischargeDate) admissionId = latest.id;
            }
        }
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        const cleaned = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value.trim()])) as unknown as ClerkingSheetData;
        transaction.set(noteRef, {
            kind: 'clerkingSheet', clerkingSheet: cleaned, ...(admissionId ? { admissionId } : {}),
            medicalNotes: cleaned.presentingComplaint, diagnosis: '', labTestsOrders: '', xrayOrders: '', prescriptionOrders: '',
            authorId: author.id, authorName: `${author.name} ${author.surname}`, authorRole: author.role, createdAt: timestamp,
        });
        if (hasVitals) transaction.set(vitalsRef, {
            ...Object.fromEntries(measurementFields.map(([field]) => [field, cleaned[field]])), height: '',
            clerkingNoteId: noteRef.id, clerkingNoteCollection: author.role === Role.Nurse ? 'nurseNotes' : 'doctorNotes',
            recordedById: author.id, recordedByName: `${author.name} ${author.surname}`, createdAt: timestamp,
        });
    });
    invalidateReads(`patient-page:${patientId}:`);
    invalidateReads(`count:patients/${patientId}/`);
    invalidateReads(`summary:patients/${patientId}/summaries/records`);
    await patientRef.collection('summaries').doc('records').update({ expiresAt: 0 }).catch(() => {});
    return { hasVitals };
}

export function clerkingSheetPrintHtml(note: import('../../types').DoctorNote, dischargeDate?: unknown) {
    const sheet = note.clerkingSheet;
    if (!sheet) return '';
    const escape = (value: string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
    const rows = [['Patient name',sheet.patientName],['Age',sheet.age],['Sex',sheet.sex],['Phone',sheet.phone],['Address',sheet.address],['Next-of-kin phone',sheet.nextOfKinPhone],['Medical aid',sheet.medicalAid],['Medical aid number',sheet.medicalAidNumber],['Presentation (Harare)',sheet.presentationAt.replace('T',' ')],
        ...historyFields.map(([key,label])=>[label,sheet[key]]), ...measurementFields.map(([key,label,unit])=>[`${label} (${unit})`,sheet[key]])];
    return '<h3>Clerking Sheet</h3>' + rows.map(([label,value])=>`<p><strong>${escape(label)}:</strong> ${escape(value || 'Not recorded').replace(/\n/g,'<br>')}</p>`).join('') + `<p><strong>Discharge:</strong> ${escape(dischargeDate ? formatRecordTimestampForPrint(dischargeDate) : 'Not recorded')}</p>`;
}
