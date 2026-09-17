import React, { useState } from 'react';
import Modal from '../../components/utils/Modal';
import { Patient } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { initialClerkingSheet, historyFields, measurementFields, saveClerkingSheet } from './clerkingSheet';

const demographics = [ ['patientName', 'Patient name'], ['age', 'Age'], ['sex', 'Sex'], ['phone', 'Cell phone'], ['address', 'Address'], ['nextOfKinPhone', 'Next-of-kin phone'], ['medicalAid', 'Medical aid'], ['medicalAidNumber', 'Medical aid number'] ] as const;
const ClerkingSheetModal: React.FC<{patient: Patient; onClose: () => void; onSaved: (hasVitals: boolean) => void}> = ({patient, onClose, onSaved}) => {
    const [form, setForm] = useState(() => initialClerkingSheet(patient));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const {userProfile} = useAuth();
    const {addNotification} = useNotification();
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!userProfile || saving) return;
        setSaving(true); setError('');
        try {
            const result = await saveClerkingSheet(patient.id!, form, userProfile);
            addNotification('Clerking sheet saved.', 'success'); onSaved(result.hasVitals); onClose();
        } catch (error: any) {setError(error.message || 'Could not save the clerking sheet.');}
        finally {setSaving(false);}
    };
    const change = (key: keyof typeof form, value: string) => setForm(previous => ({...previous, [key]: value}));
    return <Modal isOpen onClose={() => {if (!saving) onClose();}} title="Add Clerking Sheet" size="xl">
        <form onSubmit={submit}>
            <fieldset disabled={saving} className="patient-panel-scroll max-h-[65dvh] space-y-6 overflow-y-auto pr-3">
                <section><h4 className="mb-3 font-semibold text-white">Patient details</h4><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {demographics.map(([key,label]) => <label key={key} className="text-sm text-gray-400">{label}<input value={form[key]} onChange={event => change(key,event.target.value)} className="modern-input mt-1 w-full" /></label>)}
                </div><p className="mt-2 text-xs text-gray-500">Patient details are saved with this visit’s sheet.</p></section>
                <section><h4 className="mb-3 font-semibold text-white">Presentation</h4>
                    <label className="text-sm text-gray-400">Date and time (Harare)<input required type="datetime-local" value={form.presentationAt} onChange={event => change('presentationAt',event.target.value)} className="modern-input mt-1 w-full" /></label>
                </section>
                <section className="space-y-4"><h4 className="font-semibold text-white">Patient history</h4>
                    {historyFields.slice(0,4).map(([key,label]) => <label key={key} className="block text-sm text-gray-400">{label}<textarea required={key === 'presentingComplaint'} rows={3} value={form[key]} onChange={event => change(key,event.target.value)} className="modern-input mt-1 w-full" /></label>)}
                </section>
                <section><h4 className="mb-3 font-semibold text-white">Examination measurements</h4><div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {measurementFields.map(([key,label,unit]) => <label key={key} className="text-sm text-gray-400">{label} ({unit})<input type={key === 'bloodPressure' ? 'text' : 'number'} step="any" min="0" max={key === 'oxygenSaturation' ? 100 : undefined} placeholder={key === 'bloodPressure' ? '120/80' : undefined} value={form[key]} onChange={event => change(key,event.target.value)} className="modern-input mt-1 w-full" /></label>)}
                </div><p className="mt-2 text-xs text-gray-500">Entered measurements will also appear in Vitals.</p></section>
                <section className="space-y-4"><h4 className="font-semibold text-white">Examination findings</h4>
                    {historyFields.slice(4).map(([key,label]) => <label key={key} className="block text-sm text-gray-400">{label}<textarea rows={3} value={form[key]} onChange={event => change(key,event.target.value)} className="modern-input mt-1 w-full" /></label>)}
                </section>
                <p className="text-xs text-gray-500">Discharge date and time will appear from the linked admission when recorded.</p>
            </fieldset>
            {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
            <div className="mt-4 flex justify-end gap-3 border-t border-gray-700 pt-4"><button type="button" disabled={saving} onClick={onClose} className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white">Cancel</button><button disabled={saving} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50">{saving ? 'Saving…' : 'Save Clerking Sheet'}</button></div>
        </form>
    </Modal>;
};
export default ClerkingSheetModal;
