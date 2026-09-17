import React, { useEffect, useState } from 'react';
import { DoctorNote } from '../../types';
import { db } from '../../services/firebase';
import { historyFields, measurementFields } from './clerkingSheet';
import { formatRecordTimestamp } from './recordTimestamp';

const ClerkingSheetDetails: React.FC<{note: DoctorNote; patientId: string}> = ({note,patientId}) => {
    const [discharge, setDischarge] = useState<unknown>(null);
    const [loading, setLoading] = useState(Boolean(note.admissionId));
    const [error, setError] = useState('');
    useEffect(() => {
        let cancelled = false;
        setDischarge(null); setError(''); setLoading(Boolean(note.admissionId));
        if (note.admissionId) db.collection('patients').doc(patientId).collection('admissionHistory').doc(note.admissionId).get()
            .then(doc => {if (!cancelled) setDischarge(doc.data()?.dischargeDate || null);})
            .catch(() => {if (!cancelled) setError('Could not load discharge details.');})
            .finally(() => {if (!cancelled) setLoading(false);});
        return () => {cancelled = true;};
    }, [patientId,note.admissionId]);
    const sheet = note.clerkingSheet;
    if (!sheet) return null;
    const details = [['Patient name',sheet.patientName],['Age',sheet.age],['Sex',sheet.sex],['Cell phone',sheet.phone],['Address',sheet.address],['Next-of-kin phone',sheet.nextOfKinPhone],['Medical aid',sheet.medicalAid],['Medical aid number',sheet.medicalAidNumber],['Presentation',formatRecordTimestamp(`${sheet.presentationAt}:00+02:00`)],['Discharge',loading ? 'Loading…' : error || (discharge ? formatRecordTimestamp(discharge) : 'Not recorded')]];
    return <div className="space-y-5">
        <div><h4 className="font-semibold text-white">Clerking Sheet</h4><p className="mt-1 text-sm text-gray-400">{note.authorName} · {formatRecordTimestamp(note.createdAt)}</p></div>
        <dl className="grid grid-cols-1 gap-4 rounded-lg border border-gray-700 p-4 sm:grid-cols-2">{details.map(([label,value]) => <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-gray-200">{value || 'Not recorded'}</dd></div>)}</dl>
        {historyFields.slice(0,4).map(([key,label]) => <section key={key}><h4 className="mb-1 text-sm font-semibold text-gray-300">{label}</h4><p className="whitespace-pre-wrap rounded border border-gray-700 bg-gray-900/40 p-3 text-sm text-gray-300">{sheet[key] || 'Not recorded'}</p></section>)}
        <section><h4 className="mb-3 text-sm font-semibold text-gray-300">Examination measurements</h4><dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">{measurementFields.map(([key,label,unit]) => <div key={key}><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 text-sm text-gray-200">{sheet[key] ? `${sheet[key]} ${unit}` : 'Not recorded'}</dd></div>)}</dl></section>
        {historyFields.slice(4).map(([key,label]) => <section key={key}><h4 className="mb-1 text-sm font-semibold text-gray-300">{label}</h4><p className="whitespace-pre-wrap rounded border border-gray-700 bg-gray-900/40 p-3 text-sm text-gray-300">{sheet[key] || 'Not recorded'}</p></section>)}
    </div>;
};
export default ClerkingSheetDetails;
