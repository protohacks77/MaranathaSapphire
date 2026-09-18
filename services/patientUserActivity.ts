import firebase from 'firebase/compat/app';
import { db } from './firebase';
import { UserActivity } from '../types';
import { recordDate } from '../features/patients/recordTimestamp';
import { firestoreReadError } from './firestoreReadError';

interface Source {
    collection: string;
    actor: string;
    type: UserActivity['type'];
    details: string;
    date?: string;
    global?: boolean;
}
const sources: Source[] = [
    { collection: 'doctorNotes', actor: 'authorId', type: 'Doctor Note', details: 'Added doctor note' },
    { collection: 'nurseNotes', actor: 'authorId', type: 'Nurse Note', details: 'Added nurse note' },
    { collection: 'vitals', actor: 'recordedById', type: 'Vitals', details: 'Recorded vitals' },
    { collection: 'prescriptions', actor: 'authorId', type: 'Prescription', details: 'Added prescription' },
    { collection: 'labResults', actor: 'authorId', type: 'Lab Result', details: 'Added laboratory result' },
    { collection: 'labResults', actor: 'technicianId', type: 'Lab Result', details: 'Added laboratory result' },
    { collection: 'radiologyResults', actor: 'authorId', type: 'Radiology Result', details: 'Added radiology result' },
    { collection: 'radiologyResults', actor: 'radiologistId', type: 'Radiology Result', details: 'Added radiology result' },
    { collection: 'rehabilitationNotes', actor: 'authorId', type: 'Rehabilitation Note', details: 'Added rehabilitation note' },
    { collection: 'dischargeSummaries', actor: 'authorId', type: 'Discharge Summary', details: 'Added discharge summary' },
    { collection: 'admissionHistory', actor: 'admittedById', type: 'Admission', details: 'Admitted patient', date: 'admissionDate' },
    { collection: 'admissionHistory', actor: 'dischargedById', type: 'Discharge', details: 'Discharged patient', date: 'dischargeDate' },
    { collection: 'dispensingRecords', actor: 'dispensedById', type: 'Dispensing', details: 'Dispensed medication', date: 'timestamp', global: true },
];

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

export async function loadPatientUserActivities(userId: string): Promise<{ activities: UserActivity[]; error: string }> {
    const activities = new Map<string, UserActivity>();
    const patientNames = new Map<string, string>();
    const fallback: Source[] = [];
    let error = '';
    const fail = (failure: unknown) => { error ||= firestoreReadError(failure).message; };
    const collect = (source: Source, docs: firebase.firestore.QueryDocumentSnapshot[]) => {
        for (const doc of docs) {
            const data = doc.data();
            // Collection groups can contain unrelated paths; only patient subcollections belong here.
            if (!source.global && !/^patients\/[^/]+\/[^/]+\/[^/]+$/.test(doc.ref.path)) continue;
            const patientId = source.global ? data.recipientPatientId : doc.ref.parent.parent?.id;
            if (!patientId) continue;
            const clerking = ['doctorNotes', 'nurseNotes'].includes(source.collection) && data.kind === 'clerkingSheet';
            const type = clerking ? 'Clerking Sheet' : source.type;
            const id = `${type}:${doc.ref.path}`;
            activities.set(id, {
                id, originalId: doc.id, type,
                date: recordDate(data[source.date || 'createdAt']) || recordDate(data.timestamp) || recordDate(data.date) || new Date(NaN),
                patientId,
                patientName: patientNames.get(patientId) || data.clerkingSheet?.patientName || data.recipientName || 'Patient',
                details: clerking ? 'Completed clerking sheet' : source.details,
                link: `/patients/${patientId}`,
            });
        }
    };

    await Promise.all(sources.map(async source => {
        try {
            const query = source.global ? db.collection(source.collection) : db.collectionGroup(source.collection);
            collect(source, await readPages(query.where(source.actor, '==', userId)));
        } catch (failure) {
            const code = (failure as { code?: string }).code?.replace(/^firestore\//, '');
            // Existing databases may lack collection-group indexes/rules. Nested queries
            // still use their existing per-patient permissions and single-field indexes.
            if (!source.global && ['failed-precondition', 'permission-denied'].includes(code || '')) fallback.push(source);
            else fail(failure);
        }
    }));
    if (fallback.length) {
        try {
            const patients = await readPages(db.collection('patients'));
            for (const patient of patients) {
                const data = patient.data();
                patientNames.set(patient.id, `${data.name || ''} ${data.surname || ''}`.trim() || 'Patient');
            }
            // Bound parallel reads while recovering older records without a migration.
            const jobs = patients.flatMap(patient => fallback.map(source => ({ patient, source })));
            let cursor = 0;
            await Promise.all(Array.from({ length: Math.min(8, jobs.length) }, async () => {
                while (cursor < jobs.length) {
                    const { patient, source } = jobs[cursor++];
                    try { collect(source, await readPages(patient.ref.collection(source.collection).where(source.actor, '==', userId))); }
                    catch (failure) { fail(failure); }
                }
            }));
        } catch (failure) { fail(failure); }
    }
    return { activities: [...activities.values()], error };
}
