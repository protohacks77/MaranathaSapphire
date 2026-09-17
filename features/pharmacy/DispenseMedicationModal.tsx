import React, { useState, useEffect } from 'react';
import Modal from '../../components/utils/Modal';
import { InventoryItem, Patient } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { searchPatients } from '../../services/patientSearch';
import { dispenseMedication } from './dispenseMedication';

const DispenseMedicationModal: React.FC<{ item: InventoryItem; onClose: () => void; onSuccess: () => void }> = ({ item, onClose, onSuccess }) => {
    const { userProfile } = useAuth();
    const { addNotification } = useNotification();
    const [recipientName, setRecipientName] = useState('');
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [suggestions, setSuggestions] = useState<Patient[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    useEffect(() => {
        let cancelled = false;
        const query = recipientName.trim();
        setSuggestions([]);
        setSearchError('');
        if (selectedPatient || query.length < 2) { setSearching(false); return; }
        setSearching(true);
        const timer = setTimeout(async () => {
            try {
                const matches = await searchPatients(query);
                if (!cancelled) setSuggestions(matches);
            } catch {
                if (!cancelled) setSearchError('Could not search patients. Please type again to retry.');
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [recipientName, selectedPatient]);
    const [quantity, setQuantity] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!userProfile || saving || !item.id) return;
        if (!selectedPatient?.id) { setError('Select a registered patient from the suggestions.'); return; }
        setSaving(true);
        setError('');
        try {
            await dispenseMedication({ itemId: item.id, recipientPatientId: selectedPatient.id, recipientName, recipientHospitalNumber: selectedPatient.hospitalNumber, quantity: Number(quantity), notes }, userProfile);
            addNotification('Medication dispensed and stock updated.', 'success');
            onClose();
            onSuccess();
        } catch (error: any) {
            setError(error.message || 'Could not dispense medication. Please try again.');
        } finally {
            setSaving(false);
        }
    };
    return <Modal isOpen onClose={() => { if (!saving) onClose(); }} title="Dispense Medication">
        <form onSubmit={submit} className="space-y-4">
            <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3"><p className="font-semibold text-white">{item.name}</p><p className="mt-1 text-sm text-gray-400">Available: {item.quantity.toLocaleString()} units</p></div>
            <fieldset disabled={saving} className="space-y-4">
                <div>
                    <label htmlFor="dispense-recipient" className="mb-1 block text-sm text-gray-300">Patient</label>
                    <input id="dispense-recipient" required autoComplete="off" maxLength={200} placeholder="Type patient name or hospital number…" value={recipientName} onChange={e => { setRecipientName(e.target.value); setSelectedPatient(null); setError(''); }} aria-describedby="dispense-patient-status" className="modern-input w-full" />
                    <div id="dispense-patient-status" aria-live="polite" className="mt-2 text-xs text-gray-400">
                        {selectedPatient ? `Selected: ${selectedPatient.hospitalNumber}` : searching ? 'Searching patients…' : searchError || (recipientName.trim().length >= 2 && suggestions.length === 0 ? 'No matching patients found.' : 'Select a registered patient from the suggestions.')}
                    </div>
                    {!selectedPatient && suggestions.length > 0 && <ul aria-label="Matching patients" className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-700 divide-y divide-gray-700 bg-gray-800">
                        {suggestions.map(patient => <li key={patient.id}>
                            <button type="button" onClick={() => { setSelectedPatient(patient); setRecipientName(`${patient.name} ${patient.surname}`); setSuggestions([]); setError(''); }} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-gray-700 focus-visible:outline-none focus-visible:bg-gray-700">
                                <span className="text-white">{patient.name} {patient.surname}</span><span className="shrink-0 text-xs text-sky-400">{patient.hospitalNumber}</span>
                            </button>
                        </li>)}
                    </ul>}
                </div>
                <div><label htmlFor="dispense-quantity" className="mb-1 block text-sm text-gray-300">Quantity to dispense</label><input id="dispense-quantity" type="number" required min={1} max={item.quantity} step={1} value={quantity} onChange={e => setQuantity(e.target.value)} className="modern-input w-full" /></div>
                <div><label htmlFor="dispense-notes" className="mb-1 block text-sm text-gray-300">Notes (optional)</label><textarea id="dispense-notes" rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} className="modern-input w-full" /></div>
            </fieldset>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-3 border-t border-gray-700 pt-4"><button type="button" disabled={saving} onClick={onClose} className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-200 disabled:opacity-50">Cancel</button><button type="submit" disabled={saving || !selectedPatient} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50">{saving ? 'Dispensing…' : 'Dispense Medication'}</button></div>
        </form>
    </Modal>;
};
export default DispenseMedicationModal;
