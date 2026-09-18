import { firestoreReadError } from '../../services/firestoreReadError';
import DatabaseIndexLink from '../../components/utils/DatabaseIndexLink';
import ClerkingSheetPage from './ClerkingSheetPage';
import ClerkingSheetDetails from './ClerkingSheetDetails';
import { clerkingSheetPrintHtml, canAddClerkingSheet } from './clerkingSheet';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db } from '../../services/firebase';
import firebase from 'firebase/compat/app';
import { 
    Patient, Role, Bill, Payment, DoctorNote, NurseNote, Vitals, LabResult, 
    RadiologyResult, RehabilitationNote, Prescription, DischargeSummary, AdmissionRecord, Ward, BillItem, DispensingRecord
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import LoadingSpinner from '../../components/utils/LoadingSpinner';
import { 
    Edit, Save, X, User, Phone, Heart, DollarSign, FileClock, CreditCard, PlusCircle, 
    UserPlus as RegistrationIcon, Calendar, Briefcase, Stethoscope, HeartPulse, 
    Microscope, Bone, Pill,BedDouble, Clipboard, ClipboardEdit, ClipboardCheck, LogIn, LogOut, Printer, Bed, FilePlus, AlertCircle, Fingerprint, Check, Activity, ArrowLeft, Eye
} from 'lucide-react';
import MakePaymentModal from '../accounts/MakePaymentModal';
import Modal from '../../components/utils/Modal';
import './PatientProfile.css';
import { cachedRead, invalidateReads } from '../../services/readCache';
import { PAGE_SIZE, patientSections, patientRecordCounts, countRecords } from '../../services/lowReadQueries';
import { formatRecordTimestamp, formatRecordDate, formatRecordTime, newestRecordFirst, recordDate } from './recordTimestamp';

// #region Reusable UI Components
const DetailItem: React.FC<{ label: string; value?: string | number; isEditing?: boolean; name?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; icon?: React.ReactNode }> = 
({ label, value, isEditing = false, name, onChange, type = 'text', icon }) => (
    <div className="flex items-start">
        {icon && <div className="text-gray-500 mt-1 mr-3 flex-shrink-0">{icon}</div>}
        <div className="flex-grow">
            <label className="block text-sm font-medium text-gray-400">{label}</label>
            {isEditing ? (
                <input 
                    type={type} 
                    name={name}
                    value={value || ''} 
                    onChange={onChange}
                    className="mt-1 block w-full modern-input"
                />
            ) : (
                <p className="mt-1 text-md font-semibold text-white">{value || 'N/A'}</p>
            )}
        </div>
    </div>
);

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        aria-pressed={active}
        className={`shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium rounded-t-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
            active 
            ? 'bg-[#161B22] border-b-2 border-sky-500 text-white' 
            : 'text-gray-400 hover:bg-gray-800'
        }`}
    >
        {children}
    </button>
);

const MedicalSection: React.FC<{ title: string; icon: React.ReactNode; actionButton?: React.ReactNode; children: React.ReactNode; count?: number; }> = 
({ title, icon, actionButton, children, count }) => (
    <div>
        <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2"><span className="shrink-0">{icon}</span><span>{title}</span></h3>
            {actionButton}
        </div>
        <div className="space-y-4">
            {(count === undefined || count > 0) ? children : <p className="text-gray-500 text-center py-4">No {title.toLowerCase()} found.</p>}
        </div>
    </div>
);

const EditButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button 
        onClick={onClick} 
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-700/50 rounded-md hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-sky-500"
        aria-label="Edit item"
    >
        <Edit size={12} />
        Edit
    </button>
);

const ClinicalNoteCard: React.FC<{ note: DoctorNote | NurseNote }> = ({ note }) => {
    const NoteSection: React.FC<{ title: string; content?: string; icon: React.ReactNode }> = ({ title, content, icon }) => {
        if (!content || content.trim() === '') return null;
        return (
            <div>
                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-1">
                    <span className="shrink-0">{icon}</span>
                    <span>{title}</span>
                </h4>
                <div className="pl-7">
                    <p className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-900/50 p-3 rounded-md border border-gray-700/50">{content}</p>
                </div>
            </div>
        )
    };

    return (
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/50">
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-gray-700">
                <div>
                    <p className="font-semibold text-white">Note by {note.authorName?.replace(/\s*\((?:doctor|nurse)\)\s*$/i, '')}</p>
                    <p className="text-xs text-gray-400">{formatRecordTimestamp(note.createdAt)}</p>
                </div>
            </div>
            <div className="space-y-4">
                <NoteSection title="Medical Notes" content={note.medicalNotes} icon={<Clipboard size={16} className="text-sky-400" />} />
                <NoteSection title="Diagnosis" content={note.diagnosis} icon={<Stethoscope size={16} className="text-green-400" />} />
                <NoteSection title="Laboratory Orders" content={note.labTestsOrders} icon={<Microscope size={16} className="text-yellow-400" />} />
                <NoteSection title="Radiology Orders" content={note.xrayOrders} icon={<Bone size={16} className="text-indigo-400" />} />
                <NoteSection title="Prescription Orders" content={note.prescriptionOrders} icon={<Pill size={16} className="text-red-400" />} />
            </div>
        </div>
    );
};
const ClinicalNotesTable: React.FC<{ doctorNotes: DoctorNote[]; nurseNotes: NurseNote[]; patientId: string }> = ({ doctorNotes, nurseNotes, patientId }) => {
    const [selectedNote, setSelectedNote] = useState<(DoctorNote & { noteType: string }) | null>(null);
    const notes = [
        ...doctorNotes.map(note => ({ ...note, noteType: note.authorRole || 'Doctor', key: `doctor-${note.id}` })),
        ...nurseNotes.map(note => ({ ...note, noteType: note.authorRole || 'Nurse', key: `nurse-${note.id}` })),
    ].sort(newestRecordFirst);

    return (
        <>
        <div className="patient-panel-scroll overflow-x-auto rounded-lg border border-gray-700/70">
            <table className="w-full min-w-[720px] text-left text-sm">
                <caption className="sr-only">Clinical notes, newest first. Select View to open the full note details.</caption>
                <thead className="bg-[#161B22] text-xs font-medium text-gray-400">
                    <tr>
                        <th scope="col" className="px-4 py-3 font-medium">Date & Time</th>
                        <th scope="col" className="px-4 py-3 font-medium">Author</th>
                        <th scope="col" className="px-4 py-3 font-medium">Note</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">Details</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/60">
                    {notes.map(note => {
                        const sections = [
                            ['Medical Notes', note.medicalNotes], ['Diagnosis', note.diagnosis],
                            ['Laboratory Orders', note.labTestsOrders], ['Radiology Orders', note.xrayOrders],
                            ['Prescription Orders', note.prescriptionOrders],
                        ].filter(([, content]) => content?.trim());
                        return <React.Fragment key={note.key}>
                            <tr className="transition-colors hover:bg-gray-800/40">
                                <td className="whitespace-nowrap px-4 py-4 align-top tabular-nums">
                                    <p className="text-gray-300">{formatRecordDate(note.createdAt)}</p>
                                    <p className="mt-1 text-xs text-gray-500">{formatRecordTime(note.createdAt)}</p>
                                </td>
                                <td className="px-4 py-4 align-top">
                                    <div className="flex flex-col items-start gap-1.5 whitespace-nowrap">
                                    <p className="font-medium text-gray-200">{note.authorName?.replace(/\s*\((?:doctor|nurse)\)\s*$/i, '')}</p>
                                    <span className={`inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-xs ${note.noteType === 'Doctor' ? 'border-sky-500/20 bg-sky-500/10 text-sky-300' : 'border-violet-500/20 bg-violet-500/10 text-violet-300'}`}>{note.noteType}</span>
                                    </div>
                                </td>
                                <td className="w-full px-4 py-4 align-top">
                                    <p className="text-xs text-gray-500">{note.clerkingSheet ? 'Clerking Sheet' : sections.map(([label]) => label).join(' · ') || 'No content'}</p>
                                    <p className="mt-1 max-w-xl truncate text-gray-300">{sections[0]?.[1] || 'No note content recorded.'}</p>
                                </td>
                                <td className="px-4 py-4 text-right align-top">
                                    <button onClick={() => setSelectedNote(note)} aria-haspopup="dialog" aria-label={`View note by ${note.authorName}`} className="inline-flex items-center gap-2 rounded-md border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:border-gray-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                                        <Eye size={14} className="shrink-0" /> View
                                    </button>
                                </td>
                            </tr>
                        </React.Fragment>;
                    })}
                </tbody>
            </table>
        </div>
        <Modal isOpen={Boolean(selectedNote)} onClose={() => setSelectedNote(null)} title={selectedNote?.clerkingSheet ? "Clerking Sheet Details" : "Clinical Note Details"} size="lg">
            {selectedNote && <div className="patient-panel-scroll max-h-[70dvh] overflow-y-auto overscroll-contain space-y-4">
                <span className={`inline-flex rounded-md border px-2 py-1 text-xs ${selectedNote.noteType === 'Doctor' ? 'border-sky-500/20 bg-sky-500/10 text-sky-300' : 'border-violet-500/20 bg-violet-500/10 text-violet-300'}`}>{selectedNote.noteType}</span>
                {selectedNote.clerkingSheet ? <ClerkingSheetDetails note={selectedNote} patientId={patientId} /> : <ClinicalNoteCard note={selectedNote} />}
            </div>}
        </Modal>
        </>
    );
};
// #endregion

// #region Modals
const ClinicalNoteModal: React.FC<{ isOpen: boolean, onClose: () => void, noteType: 'doctor' | 'nurse', patientId: string, onNoteAdded: () => void }> = 
({ isOpen, onClose, noteType, patientId, onNoteAdded }) => {
    const { userProfile } = useAuth();
    const { addNotification } = useNotification();
    const [loading, setLoading] = useState(false);
    const [activeSection, setActiveSection] = useState<'notes' | 'diagnosis' | 'orders'>('notes');
    const initialState = { medicalNotes: '', diagnosis: '', labTestsOrders: '', xrayOrders: '', prescriptionOrders: '' };
    const [formData, setFormData] = useState(initialState);
    
    useEffect(() => {
        if (isOpen) {
            setFormData(initialState);
            setActiveSection('notes');
        }
    }, [isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setFormData((prev: any) => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userProfile || !patientId) return;
        setLoading(true);

        const collectionName = noteType === 'doctor' ? 'doctorNotes' : 'nurseNotes';
        const noteData = {
            ...formData,
            authorId: userProfile.id,
            authorName: `${userProfile.name} ${userProfile.surname} (${userProfile.role})`,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        try {
            await db.collection('patients').doc(patientId).collection(collectionName).add(noteData);
            addNotification('Note added successfully. Notes cannot be edited once saved.', 'success');
            onNoteAdded();
            onClose();
        } catch (error) {
            addNotification('Failed to add note.', 'error');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };
    
    const NavItem: React.FC<{ section: string; children: React.ReactNode; }> = ({ section, children }) => (
        <div 
            onClick={() => setActiveSection(section as any)}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all text-sm font-medium ${
                activeSection === section 
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-900/20' 
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
        >
            {children}
        </div>
    );
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Add New ${noteType === 'doctor' ? "Doctor's" : "Nurse's"} Note`} size="lg">
            <form onSubmit={handleSubmit} className="flex flex-col h-[600px] md:h-auto">
                <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
                    {/* Navigation Side */}
                    <nav className="flex md:flex-col gap-2 md:w-56 flex-shrink-0 overflow-x-auto md:overflow-visible pb-2 md:pb-0 border-b md:border-b-0 md:border-r border-gray-700/50 pr-0 md:pr-4">
                        <NavItem section="notes"><Clipboard size={18} /> Medical Notes</NavItem>
                        <NavItem section="diagnosis"><Stethoscope size={18} /> Diagnosis</NavItem>
                        <NavItem section="orders"><FilePlus size={18} /> Orders</NavItem>
                    </nav>

                    {/* Content Side */}
                    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar pr-2">
                        {activeSection === 'notes' && (
                            <div className="flex flex-col h-full space-y-2">
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Medical Notes</label>
                                <textarea 
                                    name="medicalNotes" 
                                    value={formData.medicalNotes} 
                                    onChange={handleChange} 
                                    placeholder="Enter general medical notes, observations, and patient history..." 
                                    className="modern-input flex-1 w-full resize-none p-4 min-h-[300px]" 
                                />
                            </div>
                        )}
                        {activeSection === 'diagnosis' && (
                            <div className="flex flex-col h-full space-y-2">
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Diagnosis</label>
                                <textarea 
                                    name="diagnosis" 
                                    value={formData.diagnosis} 
                                    onChange={handleChange} 
                                    placeholder="Enter primary and secondary diagnosis..." 
                                    className="modern-input flex-1 w-full resize-none p-4 min-h-[300px]" 
                                />
                            </div>
                        )}
                        {activeSection === 'orders' && (
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label htmlFor="labTestsOrders" className="flex items-center gap-2 text-sm font-semibold text-yellow-400 uppercase tracking-wide">
                                        <Microscope size={16} /> Laboratory Orders
                                    </label>
                                    <textarea name="labTestsOrders" id="labTestsOrders" value={formData.labTestsOrders} onChange={handleChange} placeholder="e.g., Full Blood Count, Malaria Test..." rows={3} className="modern-input w-full" />
                                </div>
                                <div className="space-y-2">
                                    <label htmlFor="xrayOrders" className="flex items-center gap-2 text-sm font-semibold text-indigo-400 uppercase tracking-wide">
                                        <Bone size={16} /> Radiology Orders
                                    </label>
                                    <textarea name="xrayOrders" id="xrayOrders" value={formData.xrayOrders} onChange={handleChange} placeholder="e.g., Chest X-Ray (PA and Lateral)..." rows={3} className="modern-input w-full" />
                                </div>
                                <div className="space-y-2">
                                    <label htmlFor="prescriptionOrders" className="flex items-center gap-2 text-sm font-semibold text-red-400 uppercase tracking-wide">
                                        <Pill size={16} /> Prescription Orders
                                    </label>
                                    <textarea name="prescriptionOrders" id="prescriptionOrders" value={formData.prescriptionOrders} onChange={handleChange} placeholder="e.g., Paracetamol 500mg, 2 tabs every 6 hours..." rows={3} className="modern-input w-full" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-700">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors">Cancel</button>
                    <button type="submit" disabled={loading} className="px-6 py-2 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-500 shadow-lg shadow-sky-900/20 disabled:bg-sky-800 transition-all">
                        {loading ? 'Saving...' : 'Save Note'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

const AddVitalsModal: React.FC<{ isOpen: boolean, onClose: () => void, patientId: string, onSuccess: () => void }> = ({isOpen, onClose, patientId, onSuccess}) => {
    const { userProfile } = useAuth();
    const { addNotification } = useNotification();
    const [loading, setLoading] = useState(false);
    const initial = { temperature: '', bloodPressure: '', heartRate: '', respiratoryRate: '', weight: '', height: '' };
    const [formData, setFormData] = useState(initial);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setFormData((prev: any) => ({...prev, [e.target.name]: e.target.value}));
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userProfile) return;
        setLoading(true);
        try {
            await db.collection('patients').doc(patientId).collection('vitals').add({
                ...formData,
                recordedById: userProfile.id,
                recordedByName: `${userProfile.name} ${userProfile.surname}`,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            addNotification('Vitals recorded successfully.', 'success');
            onSuccess();
            setFormData(initial);
            onClose();
        } catch (error) {
            addNotification('Failed to record vitals.', 'error');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Record Patient Vitals">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <input type="text" name="temperature" placeholder="Temp (°C)" value={formData.temperature} onChange={handleChange} className="w-full modern-input" />
                    <input type="text" name="bloodPressure" placeholder="BP (mmHg)" value={formData.bloodPressure} onChange={handleChange} className="w-full modern-input" />
                    <input type="text" name="heartRate" placeholder="Heart Rate (bpm)" value={formData.heartRate} onChange={handleChange} className="w-full modern-input" />
                    <input type="text" name="respiratoryRate" placeholder="Resp Rate (bpm)" value={formData.respiratoryRate} onChange={handleChange} className="w-full modern-input" />
                    <input type="text" name="weight" placeholder="Weight (kg)" value={formData.weight} onChange={handleChange} className="w-full modern-input" />
                    <input type="text" name="height" placeholder="Height (cm)" value={formData.height} onChange={handleChange} className="w-full modern-input" />
                </div>
                <div className="flex justify-end space-x-4 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
                    <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:bg-sky-800">Save Vitals</button>
                </div>
            </form>
        </Modal>
    )
}

const GenericNoteModal: React.FC<{ isOpen: boolean, onClose: () => void, patientId: string, onSuccess: () => void, collectionName: string, title: string, existingNote?: {id: string, content: string} | {id: string, summary: string} | {id: string, medication: string, dosage: string, instructions: string} }> = 
({ isOpen, onClose, patientId, onSuccess, collectionName, title, existingNote }) => {
    const { userProfile } = useAuth();
    const { addNotification } = useNotification();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<any>({});
    
    useEffect(() => {
        if (existingNote) {
            setFormData(existingNote);
        } else {
             setFormData({});
        }
    }, [existingNote, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData((prev: any) => ({...prev, [e.target.name]: e.target.value}));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userProfile) return;
        setLoading(true);

        const noteRef = existingNote 
            ? db.collection('patients').doc(patientId).collection(collectionName).doc(existingNote.id)
            : db.collection('patients').doc(patientId).collection(collectionName).doc();
        
        const data = {
            ...formData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        if (!existingNote) {
            data.authorId = userProfile.id;
            data.authorName = `${userProfile.name} ${userProfile.surname}`;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        }

        try {
            if (existingNote) {
                await noteRef.update(data);
            } else {
                await noteRef.set(data);
            }
            addNotification(`${title} saved successfully.`, 'success');
            onSuccess();
            onClose();
        } catch (error) {
            addNotification(`Failed to save ${title.toLowerCase()}.`, 'error');
        } finally {
            setLoading(false);
        }
    }
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={existingNote ? `Edit ${title}` : `Add ${title}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                 {collectionName === 'prescriptions' ? (
                    <>
                        <input type="text" name="medication" placeholder="Medication" value={formData.medication || ''} onChange={handleChange} required className="w-full modern-input" />
                        <input type="text" name="dosage" placeholder="Dosage" value={formData.dosage || ''} onChange={handleChange} required className="w-full modern-input" />
                        <textarea name="instructions" placeholder="Instructions" value={formData.instructions || ''} onChange={handleChange} required rows={3} className="w-full modern-input" />
                    </>
                ) : collectionName === 'labResults' ? (
                    <>
                        <input type="text" name="testName" placeholder="Test Name" value={formData.testName || ''} onChange={handleChange} required className="w-full modern-input" />
                        <input type="text" name="resultValue" placeholder="Result Value" value={formData.resultValue || ''} onChange={handleChange} required className="w-full modern-input" />
                        <textarea name="notes" placeholder="Notes" value={formData.notes || ''} onChange={handleChange} rows={3} className="w-full modern-input" />
                    </>
                ) : collectionName === 'radiologyResults' ? (
                     <>
                        <input type="text" name="imageDescription" placeholder="Image Description" value={formData.imageDescription || ''} onChange={handleChange} required className="w-full modern-input" />
                        <textarea name="findings" placeholder="Findings / Report" value={formData.findings || ''} onChange={handleChange} rows={4} required className="w-full modern-input" />
                    </>
                ) : (
                    <textarea name={collectionName === 'dischargeSummaries' ? 'summary' : 'content'} placeholder="Enter notes here..." value={formData.summary || formData.content || ''} onChange={handleChange} required rows={5} className="w-full modern-input" />
                )}
                 <div className="flex justify-end space-x-4 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
                    <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:bg-sky-800">{loading ? 'Saving...' : 'Save'}</button>
                </div>
            </form>
        </Modal>
    )
}

const AdmitPatientModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  onSuccess: () => void;
}> = ({ isOpen, onClose, patientId, onSuccess }) => {
    const { userProfile } = useAuth();
    const { addNotification } = useNotification();
    const [loading, setLoading] = useState(true);
    const [wards, setWards] = useState<Ward[]>([]);
    const [occupancy, setOccupancy] = useState<Record<string, { occupied: number, beds: number[] }>>({});
    const [selectedWardId, setSelectedWardId] = useState('');
    const [selectedBedNumber, setSelectedBedNumber] = useState<number | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        
        const fetchWardData = async () => {
            setLoading(true);
            try {
                const wardsSnapshot = await db.collection('wards').orderBy('name').get();
                const wardsData = wardsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ward));
                setWards(wardsData);

                const admittedPatients = await db.collection('patients').where('status', 'in', ['Admitted', 'PendingDischarge']).get();
                const newOccupancy: Record<string, { occupied: number, beds: number[] }> = {};
                
                admittedPatients.docs.forEach(doc => {
                    const patient = doc.data() as Patient;
                    if (patient.currentWardId && patient.currentBedNumber) {
                        if (!newOccupancy[patient.currentWardId]) {
                            newOccupancy[patient.currentWardId] = { occupied: 0, beds: [] };
                        }
                        newOccupancy[patient.currentWardId].occupied += 1;
                        newOccupancy[patient.currentWardId].beds.push(patient.currentBedNumber);
                    }
                });
                setOccupancy(newOccupancy);
            } catch (error) {
                addNotification('Failed to load ward data.', 'error');
            } finally {
                setLoading(false);
            }
        };

        fetchWardData();
    }, [isOpen, addNotification]);

    // Reset bed selection when ward changes
    useEffect(() => {
        setSelectedBedNumber(null);
    }, [selectedWardId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!userProfile || !selectedWardId || !selectedBedNumber) {
            addNotification('Please select a ward and a bed.', 'warning');
            return;
        }

        const selectedWard = wards.find(w => w.id === selectedWardId);
        if (!selectedWard) return;

        if (occupancy[selectedWardId]?.beds.includes(selectedBedNumber)) {
            addNotification(`Bed number ${selectedBedNumber} is already occupied.`, 'error');
            return;
        }
        
        setLoading(true);
        try {
            const batch = db.batch();
            const patientRef = db.collection('patients').doc(patientId);

            // Update patient's main document
            batch.update(patientRef, {
                status: 'Admitted',
                currentAdmissionDate: firebase.firestore.FieldValue.serverTimestamp(),
                currentWardId: selectedWard.id,
                currentWardName: selectedWard.name,
                currentBedNumber: selectedBedNumber,
            });

            // Create a new admission record
            const admissionRef = patientRef.collection('admissionHistory').doc();
            batch.set(admissionRef, {
                admissionDate: firebase.firestore.FieldValue.serverTimestamp(),
                admittedById: userProfile.id,
                admittedByName: `${userProfile.name} ${userProfile.surname}`,
                wardId: selectedWard.id,
                wardName: selectedWard.name,
                bedNumber: selectedBedNumber,
                lastBilledDate: firebase.firestore.FieldValue.serverTimestamp() 
            });

            await batch.commit();
            addNotification('Patient admitted successfully!', 'success');
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Admission error:", error);
            addNotification('Failed to admit patient.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const selectedWard = wards.find(w => w.id === selectedWardId);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Admit Patient to Ward" size="lg">
            {loading ? <LoadingSpinner /> : (
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Select Ward</label>
                        <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                           {wards.map(ward => {
                                const occupiedCount = occupancy[ward.id]?.occupied || 0;
                                const isFull = occupiedCount >= ward.totalBeds;
                                const isSelected = selectedWardId === ward.id;
                                return (
                                    <div
                                        key={ward.id}
                                        onClick={() => !isFull && setSelectedWardId(ward.id)}
                                        className={`ward-card ${isSelected ? 'selected' : ''} ${isFull ? 'disabled' : ''}`}
                                    >
                                        <div className="ward-card-radio"></div>
                                        <p className="font-bold text-white text-sm">{ward.name}</p>
                                        <p className="text-xs text-gray-400">
                                            {occupiedCount} / {ward.totalBeds} Beds
                                            {isFull && <span className="text-red-500 font-bold ml-1">FULL</span>}
                                        </p>
                                        <p className="text-sm font-semibold text-green-400 mt-2">${ward.pricePerDay.toFixed(2)}/day</p>
                                    </div>
                                );
                           })}
                        </div>
                    </div>
                    
                    {/* Bed Grid Selection */}
                    {selectedWard && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-3">
                                Select Bed in <span className="text-sky-400">{selectedWard.name}</span>
                            </label>
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3 max-h-60 overflow-y-auto custom-scrollbar p-1">
                                {Array.from({ length: selectedWard.totalBeds }, (_, i) => i + 1).map(bedNum => {
                                    const isOccupied = occupancy[selectedWard.id]?.beds.includes(bedNum);
                                    const isSelected = selectedBedNumber === bedNum;
                                    
                                    return (
                                        <button
                                            key={bedNum}
                                            type="button"
                                            disabled={isOccupied}
                                            onClick={() => setSelectedBedNumber(bedNum)}
                                            className={`
                                                relative flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-200
                                                ${isOccupied 
                                                    ? 'bg-red-900/20 border-red-900/50 text-red-500 opacity-70 cursor-not-allowed' 
                                                    : isSelected
                                                        ? 'bg-sky-600 border-sky-500 text-white shadow-lg shadow-sky-900/50 scale-105'
                                                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-500'
                                                }
                                            `}
                                        >
                                            <Bed size={20} className={isOccupied ? 'text-red-500' : (isSelected ? 'text-white' : 'text-gray-400')} />
                                            <span className="text-xs font-bold mt-1">{bedNum}</span>
                                            {isOccupied && (
                                                <div className="absolute top-0 right-0 -mt-1 -mr-1 bg-red-600 rounded-full p-0.5">
                                                    <X size={8} className="text-white" />
                                                </div>
                                            )}
                                            {isSelected && (
                                                <div className="absolute top-0 right-0 -mt-1 -mr-1 bg-green-500 rounded-full p-0.5">
                                                    <Check size={8} className="text-white" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex gap-4 mt-3 text-xs text-gray-400">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-gray-800 border border-gray-700 rounded"></div> Available
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-red-900/20 border border-red-900/50 rounded"></div> Occupied
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-sky-600 border border-sky-500 rounded"></div> Selected
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end space-x-4 pt-4 border-t border-gray-700">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
                        <button 
                            type="submit" 
                            disabled={loading || !selectedWardId || !selectedBedNumber} 
                            className="px-6 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-sky-900/20"
                        >
                            Confirm Admission
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
};
// #endregion

// FinancialsView Component
const FinancialsView: React.FC<{ patient: Patient; bills: Bill[]; payments: Payment[] }> = ({ patient, bills, payments }) => {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#161B22] border border-gray-700 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Total Billed</p>
                    <p className="text-2xl font-bold text-white">${patient.financials.totalBill.toFixed(2)}</p>
                </div>
                <div className="bg-[#161B22] border border-gray-700 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Total Paid</p>
                    <p className="text-2xl font-bold text-green-400">${patient.financials.amountPaid.toFixed(2)}</p>
                </div>
                <div className="bg-[#161B22] border border-gray-700 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Outstanding Balance</p>
                    <p className={`text-2xl font-bold ${patient.financials.balance > 0 ? 'text-red-400' : 'text-gray-200'}`}>${patient.financials.balance.toFixed(2)}</p>
                </div>
            </div>

            <div className="bg-[#161B22] border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center"><FileClock size={18} className="mr-2 text-sky-400"/> Billing History</h3>
                {bills.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-400">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-800">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Bill ID</th>
                                    <th className="px-4 py-3">Items</th>
                                    <th className="px-4 py-3 text-right">Total</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bills.map(bill => (
                                    <tr key={bill.id} className="border-b border-gray-700 hover:bg-gray-800">
                                        <td className="px-4 py-3">{new Date(bill.date).toLocaleDateString()}</td>
                                        <td className="px-4 py-3 font-mono text-xs">{bill.id?.slice(0, 8)}...</td>
                                        <td className="px-4 py-3">{bill.items.length} items</td>
                                        <td className="px-4 py-3 text-right text-white font-medium">${bill.totalBill.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs ${bill.status === 'Paid' ? 'bg-green-900 text-green-300' : bill.status === 'Partially Paid' ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300'}`}>
                                                {bill.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Link to={`/bills/${bill.id}`} className="text-sky-500 hover:underline text-xs">View</Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <p className="text-gray-500 text-center py-4">No billing history found.</p>}
            </div>

            <div className="bg-[#161B22] border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center"><DollarSign size={18} className="mr-2 text-green-400"/> Payment History</h3>
                {payments.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-400">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-800">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Method</th>
                                    <th className="px-4 py-3">Processed By</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map(payment => (
                                    <tr key={payment.id} className="border-b border-gray-700 hover:bg-gray-800">
                                        <td className="px-4 py-3">{new Date(payment.date).toLocaleDateString()}</td>
                                        <td className="px-4 py-3">{payment.paymentMethod}</td>
                                        <td className="px-4 py-3">{payment.processedByName}</td>
                                        <td className="px-4 py-3 text-right text-green-400 font-medium">${payment.amount.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <p className="text-gray-500 text-center py-4">No payment history found.</p>}
            </div>
        </div>
    );
};

// MedicalHistoryView Component
const MedicalHistoryView: React.FC<{ 
    patient: Patient;
    permissions: any;
    data: any;
    openModal: (name: 'vitals' | 'payment' | 'clinicalNote' | 'labResult' | 'radiologyResult' | 'rehabNote' | 'prescription' | 'dischargeSummary' | 'admit', item?: any) => void;
    openClerkingSheet: () => void;
    openClinicalNoteModal: (type: 'doctor' | 'nurse') => void;
    onInitiateDischarge: () => void;
    statusClasses: any;
    section: string;
}> = ({ patient, permissions, data, openModal, openClinicalNoteModal, openClerkingSheet, onInitiateDischarge, statusClasses, section }) => {
    return (
        <div className="space-y-6">
            {/* Status & Actions Bar */}
            <div className="bg-[#161B22] border border-gray-700 p-4 rounded-lg flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm font-medium">Current Status:</span>
                    <span className={`px-3 py-1 text-sm font-bold rounded-full ${statusClasses[patient.status]}`}>
                        {patient.status === 'PendingDischarge' ? 'Pending Discharge' : patient.status}
                    </span>
                </div>
                <div className="flex gap-3">
                    {permissions.canManageAdmission && patient.status !== 'Admitted' && patient.status !== 'PendingDischarge' && (
                        <button onClick={() => openModal('admit')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2">
                            <LogIn size={16} /> Admit Patient
                        </button>
                    )}
                    {permissions.canManageAdmission && patient.status === 'Admitted' && (
                        <button onClick={onInitiateDischarge} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2">
                            <LogOut size={16} /> Request Discharge
                        </button>
                    )}
                </div>
            </div>

            {/* Vitals Section */}
            {section === 'vitals' && (
            <MedicalSection title="Vitals History" icon={<HeartPulse className="text-red-400" size={20} />}
                actionButton={permissions.canAddVitals && <button onClick={() => openModal('vitals')} className="text-sm text-sky-500 hover:underline">+ Record Vitals</button>}
                count={data.vitals.length}
            >
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-800">
                            <tr>
                                <th className="px-4 py-2">Date</th>
                                <th className="px-4 py-2">BP</th>
                                <th className="px-4 py-2">HR</th>
                                <th className="px-4 py-2">Temp</th>
                                <th className="px-4 py-2">RR</th>
                                <th className="px-4 py-2">SpO₂</th><th className="px-4 py-2">RBS (mmol/L)</th>
                                <th className="px-4 py-2">Weight</th>
                                <th className="px-4 py-2">Rec. By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.vitals.map((v: Vitals) => (
                                <tr key={v.id} className="border-b border-gray-700">
                                    <td className="px-4 py-2">{formatRecordTimestamp(v.createdAt)}</td>
                                    <td className="px-4 py-2">{v.bloodPressure}</td>
                                    <td className="px-4 py-2">{v.heartRate}</td>
                                    <td className="px-4 py-2">{v.temperature}</td>
                                    <td className="px-4 py-2">{v.respiratoryRate}</td>
                                    <td className="px-4 py-2">{v.oxygenSaturation || '—'}</td><td className="px-4 py-2">{v.randomBloodSugar || '—'}</td>
                                    <td className="px-4 py-2">{v.weight}</td>
                                    <td className="px-4 py-2">{v.recordedByName}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </MedicalSection>
            )}

            {/* Clinical Notes Section */}
            {section === 'clinical' && (
            <MedicalSection title="Clinical Notes" icon={<Clipboard className="text-sky-400" size={20} />}
                actionButton={
                    <div className="flex flex-wrap gap-2">
                        {permissions.canAddClerkingSheet && <button onClick={openClerkingSheet} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500 focus-visible:ring-2 focus-visible:ring-green-400"><FilePlus size={16} /> Add Clerking Sheet</button>}
                        {permissions.canAddDoctorNote && <button onClick={() => openClinicalNoteModal('doctor')} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117]"><PlusCircle size={16} className="shrink-0" /> Add Doctor Note</button>}
                        {permissions.canAddNurseNote && <button onClick={() => openClinicalNoteModal('nurse')} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117]"><PlusCircle size={16} className="shrink-0" /> Add Nurse Note</button>}
                    </div>
                }
                count={[...data.doctorNotes, ...data.nurseNotes].length}
            >
                <ClinicalNotesTable doctorNotes={data.doctorNotes} nurseNotes={data.nurseNotes} patientId={patient.id!} />
            </MedicalSection>
            )}

            {/* Prescriptions Section */}
            {section === 'prescriptions' && (
            <MedicalSection title="Prescriptions" icon={<Pill className="text-red-400" size={20} />}
                actionButton={permissions.canAddEditPrescription && <button onClick={() => openModal('prescription')} className="text-sm text-sky-500 hover:underline">+ Add Prescription</button>}
                count={data.prescriptions.length}
            >
                <div className="space-y-3">
                    {data.prescriptions.map((p: Prescription) => (
                        <div key={p.id} className="bg-gray-800/50 p-3 rounded-md border border-gray-700 flex justify-between items-start">
                            <div>
                                <p className="font-semibold text-white">{p.medication} - {p.dosage}</p>
                                <p className="text-sm text-gray-300 mt-1">{p.instructions}</p>
                                <p className="text-xs text-gray-500 mt-2">Prescribed by {p.authorName} on {formatRecordTimestamp(p.createdAt)}</p>
                            </div>
                            {permissions.canAddEditPrescription && <EditButton onClick={() => openModal('prescription', p)} />}
                        </div>
                    ))}
                </div>
            </MedicalSection>
            )}

            {section === 'dispensed' && <MedicalSection title="Dispensed Medication" icon={<Pill className="text-green-400" size={20} />} count={data.dispensedMedication.length}>
                <div className="patient-panel-scroll overflow-x-auto rounded-lg border border-gray-700/70">
                    <table className="w-full min-w-[680px] text-left text-sm">
                        <caption className="sr-only">Medication dispensed to this patient, newest first</caption>
                        <thead className="bg-[#161B22] text-xs text-gray-400"><tr>
                            <th scope="col" className="px-4 py-3 font-medium">Date & Time</th>
                            <th scope="col" className="px-4 py-3 font-medium">Medication</th>
                            <th scope="col" className="px-4 py-3 text-right font-medium">Quantity</th>
                            <th scope="col" className="px-4 py-3 font-medium">Dispensed By</th>
                            <th scope="col" className="px-4 py-3 font-medium">Bill</th>
                            <th scope="col" className="px-4 py-3 font-medium">Notes</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-700/60">{data.dispensedMedication.map((record: DispensingRecord) => <tr key={record.id} className="hover:bg-gray-800/40">
                            <td className="px-4 py-4 align-top whitespace-nowrap tabular-nums"><p className="text-gray-300">{formatRecordDate(record.timestamp)}</p><p className="mt-1 text-xs text-gray-500">{formatRecordTime(record.timestamp)}</p></td>
                            <td className="px-4 py-4 align-top font-medium text-gray-200">{record.itemName}</td>
                            <td className="px-4 py-4 align-top text-right tabular-nums text-gray-300">{record.quantity}</td>
                            <td className="px-4 py-4 align-top text-gray-300">{record.dispensedByName}</td>
                            <td className="px-4 py-4 align-top text-gray-400">{record.billId ? <Link to={`/bills/${record.billId}`} className="text-sky-400 hover:underline">{record.billId.slice(0, 8)}</Link> : 'Manual dispense'}</td>
                            <td className="px-4 py-4 align-top whitespace-pre-wrap break-words text-gray-400">{record.notes || '—'}</td>
                        </tr>)}</tbody>
                    </table>
                </div>
            </MedicalSection>}

            {/* Lab Results Section */}
            {section === 'labs' && (
            <MedicalSection title="Laboratory Results" icon={<Microscope className="text-yellow-400" size={20} />}
                actionButton={permissions.canAddLabResult && <button onClick={() => openModal('labResult')} className="text-sm text-sky-500 hover:underline">+ Add Result</button>}
                count={data.labResults.length}
            >
                <div className="space-y-3">
                    {data.labResults.map((r: LabResult) => (
                        <div key={r.id} className="bg-gray-800/50 p-3 rounded-md border border-gray-700">
                            <div className="flex justify-between">
                                <p className="font-semibold text-white">{r.testName}</p>
                                <span className="text-xs text-gray-500">{formatRecordTimestamp(r.createdAt)}</span>
                            </div>
                            <p className="text-sm text-gray-300 mt-1">Result: <span className="text-white font-medium">{r.resultValue}</span></p>
                            {r.notes && <p className="text-xs text-gray-400 mt-1 italic">Notes: {r.notes}</p>}
                            <p className="text-xs text-gray-500 mt-2">Technician: {r.technicianName}</p>
                        </div>
                    ))}
                </div>
            </MedicalSection>
            )}

            {/* Radiology Results Section */}
            {section === 'radiology' && (
            <MedicalSection title="Radiology Results" icon={<Bone className="text-indigo-400" size={20} />}
                actionButton={permissions.canAddRadiologyResult && <button onClick={() => openModal('radiologyResult')} className="text-sm text-sky-500 hover:underline">+ Add Report</button>}
                count={data.radiologyResults.length}
            >
                <div className="space-y-3">
                    {data.radiologyResults.map((r: RadiologyResult) => (
                        <div key={r.id} className="bg-gray-800/50 p-3 rounded-md border border-gray-700">
                            <div className="flex justify-between">
                                <p className="font-semibold text-white">{r.imageDescription}</p>
                                <span className="text-xs text-gray-500">{formatRecordTimestamp(r.createdAt)}</span>
                            </div>
                            <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">{r.findings}</p>
                            <p className="text-xs text-gray-500 mt-2">Radiologist: {r.radiologistName}</p>
                        </div>
                    ))}
                </div>
            </MedicalSection>
            )}

            {/* Rehabilitation Notes */}
            {section === 'rehab' && (
            <MedicalSection title="Rehabilitation Notes" icon={<Activity className="text-green-400" size={20} />}
                actionButton={permissions.canAddEditRehabNote && <button onClick={() => openModal('rehabNote')} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117]"><PlusCircle size={16} className="shrink-0" /> Add Note</button>}
                count={data.rehabNotes.length}
            >
                <div className="space-y-3">
                    {data.rehabNotes.map((n: RehabilitationNote) => (
                        <div key={n.id} className="bg-gray-800/50 p-3 rounded-md border border-gray-700">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs text-gray-500">{formatRecordTimestamp(n.createdAt)} - {n.authorName}</p>
                                    <p className="text-sm text-gray-300 mt-1">{n.content}</p>
                                </div>
                                {permissions.canAddEditRehabNote && <EditButton onClick={() => openModal('rehabNote', n)} />}
                            </div>
                        </div>
                    ))}
                </div>
            </MedicalSection>
            )}

            {/* Discharge Summaries */}
            {section === 'discharge' && (
            <MedicalSection title="Discharge Summaries" icon={<ClipboardCheck className="text-teal-400" size={20} />}
                actionButton={permissions.canAddEditDischargeSummary && <button onClick={() => openModal('dischargeSummary')} className="text-sm text-sky-500 hover:underline">+ Add Summary</button>}
                count={data.dischargeSummaries.length}
            >
                <div className="space-y-3">
                    {data.dischargeSummaries.map((s: DischargeSummary) => (
                        <div key={s.id} className="bg-gray-800/50 p-3 rounded-md border border-gray-700">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs text-gray-500">{formatRecordTimestamp(s.createdAt)} - {s.authorName}</p>
                                    <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">{s.summary}</p>
                                </div>
                                {permissions.canAddEditDischargeSummary && <EditButton onClick={() => openModal('dischargeSummary', s)} />}
                            </div>
                        </div>
                    ))}
                </div>
            </MedicalSection>
            )}

            {/* Admission History */}
            {section === 'admissions' && (
            <MedicalSection title="Admission History" icon={<BedDouble className="text-purple-400" size={20} />} count={data.admissionHistory.length}>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-800">
                            <tr>
                                <th className="px-4 py-2">Admitted</th>
                                <th className="px-4 py-2">Ward</th>
                                <th className="px-4 py-2">Bed</th>
                                <th className="px-4 py-2">Admitted By</th>
                                <th className="px-4 py-2">Discharged</th>
                                <th className="px-4 py-2">Discharged By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.admissionHistory.map((rec: AdmissionRecord) => (
                                <tr key={rec.id} className="border-b border-gray-700">
                                    <td className="px-4 py-2">{rec.admissionDate?.toDate ? rec.admissionDate.toDate().toLocaleDateString() : 'N/A'}</td>
                                    <td className="px-4 py-2">{rec.wardName}</td>
                                    <td className="px-4 py-2">{rec.bedNumber}</td>
                                    <td className="px-4 py-2">{rec.admittedByName}</td>
                                    <td className="px-4 py-2">{rec.dischargeDate?.toDate ? rec.dischargeDate.toDate().toLocaleDateString() : '-'}</td>
                                    <td className="px-4 py-2">{rec.dischargedByName || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </MedicalSection>
            )}
        </div>
    );
};

const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`rounded bg-gray-700/50 motion-safe:animate-pulse ${className}`} />
);

const PatientProfileSkeleton: React.FC<{ records: boolean; section: string; contentOnly?: boolean }> = ({ records, section, contentOnly = false }) => (
    <div role="status" aria-busy="true" aria-label={records ? 'Loading patient records' : 'Loading patient profile'} className={records ? 'space-y-6' : 'h-full min-h-0'}>
        <span className="sr-only">{records ? 'Loading patient records…' : 'Loading patient profile…'}</span>
        <div aria-hidden="true" className={records ? 'space-y-6' : 'h-full min-h-0'}>
            {records && !contentOnly && <div className="flex items-center gap-4">
                <SkeletonBlock className="h-9 w-44" />
                <SkeletonBlock className="h-4 w-52" />
            </div>}
            {records ? <>
                {!contentOnly && <div className="flex gap-1 overflow-hidden border-b border-gray-700 pb-3">
                    {Array.from({ length: 10 }, (_, i) => <div key={i} className="flex shrink-0 items-center gap-2 px-4 py-2">
                        <SkeletonBlock className="h-4 w-20" /><SkeletonBlock className="h-5 w-6 rounded-full" />
                    </div>)}
                </div>}
                {!['financials', 'registration'].includes(section) && <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-[#161B22] p-4">
                    <div className="flex gap-3"><SkeletonBlock className="h-4 w-24" /><SkeletonBlock className="h-6 w-20 rounded-full" /></div>
                    <SkeletonBlock className="h-9 w-36" />
                </div>}
                <div className="flex items-center justify-between"><SkeletonBlock className="h-6 w-48" /><SkeletonBlock className="h-4 w-28" /></div>
                {['clinical', 'vitals', 'admissions', 'financials', 'dispensed'].includes(section) ? (
                    <div className="overflow-hidden rounded-lg border border-gray-700">
                        {Array.from({ length: 7 }, (_, row) => <div key={row} className={`grid ${section === 'clinical' ? 'grid-cols-4' : section === 'dispensed' ? 'grid-cols-6' : 'grid-cols-7'} gap-5 p-4 ${row === 0 ? 'bg-gray-800' : 'border-t border-gray-700'}`}>
                            {Array.from({ length: section === 'clinical' ? 4 : section === 'dispensed' ? 6 : 7 }, (_, col) => <SkeletonBlock key={col} className="h-4 w-full" />)}
                        </div>)}
                    </div>
                ) : Array.from({ length: section === 'registration' ? 1 : 2 }, (_, i) => (
                    <div key={i} className="rounded-lg border border-gray-700/50 bg-gray-800/50 p-4">
                        <div className="mb-4 space-y-2 border-b border-gray-700 pb-3">
                            <SkeletonBlock className="h-5 w-48" /><SkeletonBlock className="h-3 w-32" />
                        </div>
                        <div className="space-y-5">
                            {Array.from({ length: section === 'clinical' ? 3 : 1 }, (_, j) => <div key={j} className="space-y-3">
                                <SkeletonBlock className="h-4 w-36" />
                                <div className="ml-7 space-y-2 rounded-md border border-gray-700/50 bg-gray-900/50 p-3">
                                    <SkeletonBlock className="h-4 w-full" /><SkeletonBlock className="h-4 w-5/6" /><SkeletonBlock className="h-4 w-2/3" />
                                </div>
                            </div>)}
                        </div>
                    </div>
                ))}
            </> : <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:grid-cols-[minmax(0,1fr)_400px] grid-rows-2 lg:grid-rows-1">
                <div className="patient-panel-scroll min-w-0 min-h-0 overflow-y-auto space-y-6 p-4 sm:p-6 md:p-8">
                    <SkeletonBlock className="h-4 w-52" />
                    <div className="flex flex-wrap justify-between gap-4">
                        <div className="space-y-2"><SkeletonBlock className="h-8 w-60" /><SkeletonBlock className="h-4 w-36" /></div>
                        <SkeletonBlock className="h-10 w-36" />
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
                        <div className="rounded-xl border border-gray-700 bg-[#161B22] p-6 space-y-5">
                            <SkeletonBlock className="mx-auto h-20 w-20 rounded-full" />
                            <SkeletonBlock className="mx-auto h-6 w-44" /><SkeletonBlock className="mx-auto h-4 w-32" />
                            <SkeletonBlock className="mx-auto h-6 w-24 rounded-full" /><SkeletonBlock className="h-16 w-full" /><SkeletonBlock className="h-9 w-full" />
                        </div>
                        <div className="rounded-xl border border-gray-700 bg-[#161B22] p-6 space-y-6">
                            <SkeletonBlock className="h-5 w-40" />
                            {Array.from({ length: 5 }, (_, i) => <div key={i} className="flex items-center gap-3 border-t border-gray-700 pt-4"><SkeletonBlock className="h-4 w-4" /><SkeletonBlock className="h-4 flex-1" /><SkeletonBlock className="h-6 w-7" /></div>)}
                        </div>
                    </div>
                </div>
                <div className="patient-panel-scroll min-w-0 min-h-0 h-full overflow-y-auto rounded-none border-l border-gray-700 bg-[#161B22] p-6 space-y-6">
                    <SkeletonBlock className="h-5 w-32" />
                    <div className="grid grid-cols-2 gap-6">
                        {Array.from({ length: 8 }, (_, i) => <div key={i} className="min-w-0 space-y-2"><SkeletonBlock className="h-3 w-20" /><SkeletonBlock className="h-5 w-full" /></div>)}
                    </div>
                    {Array.from({ length: 2 }, (_, i) => <div key={i} className="border-t border-gray-700 pt-6 space-y-5">
                        <SkeletonBlock className="h-5 w-36" />
                        {Array.from({ length: 3 }, (_, j) => <div key={j} className="space-y-2"><SkeletonBlock className="h-3 w-24" /><SkeletonBlock className="h-5 w-3/4" /></div>)}
                    </div>)}
                </div>
            </div>}
        </div>
    </div>
);

const PatientProfile: React.FC = () => {
  const { id, '*': patientPath } = useParams<{ id: string; '*': string }>();
  const recordTab = patientPath?.startsWith('records/') ? patientPath.split('/')[1] : undefined;
    const isClerkingSheetPage = patientPath === 'clerking-sheet';
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { addNotification } = useNotification();

  // States
  const [patient, setPatient] = useState<Patient | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [doctorNotes, setDoctorNotes] = useState<DoctorNote[]>([]);
  const [nurseNotes, setNurseNotes] = useState<NurseNote[]>([]);
  const [vitals, setVitals] = useState<Vitals[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [radiologyResults, setRadiologyResults] = useState<RadiologyResult[]>([]);
  const [rehabNotes, setRehabNotes] = useState<RehabilitationNote[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [dispensedMedication, setDispensedMedication] = useState<DispensingRecord[]>([]);
  const [dischargeSummaries, setDischargeSummaries] = useState<DischargeSummary[]>([]);
  const [admissionHistory, setAdmissionHistory] = useState<AdmissionRecord[]>([]);

  // UI States
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const recordTabs = ['clinical', 'vitals', 'prescriptions', 'dispensed', 'labs', 'radiology', 'rehab', 'admissions', 'discharge', 'financials'];
  const isRecordsPage = Boolean(recordTab);
  const activeTab = recordTabs.includes(recordTab || '') ? recordTab! : 'clinical';
  const openRecords = (tab: string) => navigate(`/patients/${id}/records/${tab}`);
  const [formData, setFormData] = useState<Partial<Patient>>({});
  const [registrarName, setRegistrarName] = useState<string>('Unknown');
  const isBillingCheckRunningRef = useRef(false);
  
  // Modal States
  const [modalState, setModalState] = useState({
      payment: false,
      clinicalNote: false,
      vitals: false,
      labResult: false,
      radiologyResult: false,
      rehabNote: false,
      prescription: false,
      dischargeSummary: false,
      admit: false,
  });
  const [noteTypeToAdd, setNoteTypeToAdd] = useState<'doctor' | 'nurse'>('doctor');
  const [editingItem, setEditingItem] = useState<any | null>(null);

  const statusClasses = {
    Admitted: 'bg-blue-900 text-blue-300 admitted-ripple',
    PendingDischarge: 'bg-yellow-900 text-yellow-300',
    Discharged: 'bg-gray-700 text-gray-300',
  };
  
  // Read only the current admission; financial writes recheck it atomically.
  const handleAutomaticBedBilling = useCallback(async (patientData: Patient, history: AdmissionRecord[]) => {
    if (!navigator.onLine || isBillingCheckRunningRef.current || !['Admitted', 'PendingDischarge'].includes(patientData.status) || !patientData.currentWardId) return false;
    const admission = history.find(record => !record.dischargeDate);
    if (!admission) return false;
    const last = recordDate(admission.lastBilledDate || admission.admissionDate);
    if (!last || Date.now() - last.getTime() < 86400000) return false;
    isBillingCheckRunningRef.current = true;
    try {
      const patientRef = db.collection('patients').doc(patientData.id!);
      const admissionRef = patientRef.collection('admissionHistory').doc(admission.id);
      const billRef = db.collection('bills').doc();
      return await db.runTransaction(async transaction => {
        const [patientDoc, admissionDoc, wardDoc] = await Promise.all([
          transaction.get(patientRef), transaction.get(admissionRef), transaction.get(db.collection('wards').doc(patientData.currentWardId!)),
        ]);
        const current = patientDoc.data() as Patient | undefined;
        const record = admissionDoc.data() as AdmissionRecord | undefined;
        const ward = wardDoc.data() as Ward | undefined;
        if (!current || !record || !ward || !['Admitted', 'PendingDischarge'].includes(current.status) || current.currentWardId !== patientData.currentWardId || record.dischargeDate || ward.pricePerDay <= 0) return false;
        const billedUntil = recordDate(record.lastBilledDate || record.admissionDate);
        if (!billedUntil) return false;
        const periods = Math.floor((Date.now() - billedUntil.getTime()) / 86400000);
        if (periods <= 0) return false;
        const items: BillItem[] = Array.from({ length: periods }, (_, index) => {
          const date = new Date(billedUntil.getTime() + (index + 1) * 86400000);
          return { id: `bed-charge-${current.currentWardId}-${date.getTime()}`, description: `Bed Charge - ${ward.name} (${date.toLocaleDateString()})`, department: 'Admissions', quantity: 1, unitPrice: ward.pricePerDay, totalPrice: ward.pricePerDay };
        });
        const total = periods * ward.pricePerDay;
        transaction.set(billRef, { patientId: patientData.id!, patientName: `${current.name} ${current.surname}`, patientHospitalNumber: current.hospitalNumber,
          items, pharmacyTotal: 0, pharmacyQuantity: 0, dispensingStatus: 'Complete', totalBill: total, amountPaidAtTimeOfBill: 0, balance: total,
          paymentMethod: 'CASH', date: new Date().toISOString(), processedBy: 'SYSTEM_AUTO_BILL', status: 'Unpaid' });
        transaction.update(patientRef, { 'financials.totalBill': firebase.firestore.FieldValue.increment(total), 'financials.balance': firebase.firestore.FieldValue.increment(total) });
        transaction.update(admissionRef, { lastBilledDate: firebase.firestore.Timestamp.fromDate(new Date(billedUntil.getTime() + periods * 86400000)) });
        return true;
      });
    } catch (error) { addNotification('Could not update bed charges.', 'error'); return false; }
    finally { isBillingCheckRunningRef.current = false; }
  }, [addNotification]);

  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [hasMoreRecords, setHasMoreRecords] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [recordIndexUrl, setRecordIndexUrl] = useState('');
  const recordPages = useRef<Record<string, { documents: any[]; cursor: firebase.firestore.QueryDocumentSnapshot | null; more: boolean; loadedAt: number }>>({});
  const currentPatientId = useRef(id);
  currentPatientId.current = id;
  const currentTab = useRef(activeTab);
  currentTab.current = activeTab;

  const loadSection = useCallback(async (tab: string, append = false, force = false) => {
    if (!id) return;
    const sources = tab === 'financials' ? ['bills', 'payments'] : tab === 'dispensed' ? ['dispensingRecords'] : patientSections[tab] || [];
    if (!sources.length) return;
    if (currentTab.current === tab) { setRecordsLoading(true); setRecordError(''); setRecordIndexUrl(''); }
    try {
      const results = await Promise.all(sources.map(async source => {
        const key = `${id}:${source}`;
        const previous = recordPages.current[key];
        if (!force && !append && previous && Date.now() - previous.loadedAt < 60_000) return [source, previous] as const;
        if (append && previous && !previous.more) return [source, previous] as const;
        const global = ['bills', 'payments', 'dispensingRecords'].includes(source);
        const field = source === 'admissionHistory' ? 'admissionDate' : source === 'dispensingRecords' ? 'timestamp' : global ? 'date' : 'createdAt';
        let query: firebase.firestore.Query = global
          ? db.collection(source).where(source === 'dispensingRecords' ? 'recipientPatientId' : 'patientId', '==', id)
          : db.collection('patients').doc(id).collection(source);
        query = query.orderBy(field, 'desc');
        if (append && previous?.cursor) query = query.startAfter(previous.cursor);
        const cacheKey = `patient-page:${key}:${append ? previous?.cursor?.id || 'first' : 'first'}`;
        if (force) invalidateReads(`patient-page:${key}:`);
        const snapshot = await cachedRead(cacheKey, () => query.limit(PAGE_SIZE).get());
        const documents = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        return [source, { documents: append ? [...(previous?.documents || []), ...documents] : documents,
          loadedAt: Date.now(), cursor: snapshot.docs[snapshot.docs.length - 1] || null, more: snapshot.size === PAGE_SIZE }] as const;
      }));
      if (currentPatientId.current !== id) return;
      const setters: Record<string, (value: any[]) => void> = {
        doctorNotes: setDoctorNotes, nurseNotes: setNurseNotes, vitals: setVitals, labResults: setLabResults,
        radiologyResults: setRadiologyResults, rehabilitationNotes: setRehabNotes, prescriptions: setPrescriptions,
        dischargeSummaries: setDischargeSummaries, admissionHistory: setAdmissionHistory,
        bills: setBills, payments: setPayments, dispensingRecords: setDispensedMedication,
      };
      results.forEach(([source, page]) => { recordPages.current[`${id}:${source}`] = page; setters[source](page.documents); });
      if (currentTab.current === tab) setHasMoreRecords(results.some(([, page]) => page.more));
    } catch (error) {
      if (currentPatientId.current === id && currentTab.current === tab) { const failure = firestoreReadError(error); setRecordError(failure.message); setRecordIndexUrl(failure.indexUrl); }
    } finally {
      if (currentPatientId.current === id && currentTab.current === tab) setRecordsLoading(false);
    }
  }, [id]);

  const refreshSection = useCallback(async (tab: string) => {
    if (!id) return;
    const paths = tab === 'financials' ? ['bills', 'payments'] : tab === 'dispensed' ? ['dispensingRecords'] : patientSections[tab] || [];
    paths.forEach(path => invalidateReads(`count:${['bills', 'payments', 'dispensingRecords'].includes(path) ? path : `patients/${id}/${path}`}:`));
    await loadSection(tab, false, true);
    const values = await Promise.all(paths.map(path => countRecords(
      ['bills', 'payments', 'dispensingRecords'].includes(path) ? path : `patients/${id}/${path}`,
      ['bills', 'payments', 'dispensingRecords'].includes(path) ? [[path === 'dispensingRecords' ? 'recipientPatientId' : 'patientId', '==', id]] : [])));
    const total = values.reduce((a, b) => a + b, 0);
    if (currentPatientId.current === id) setRecordCounts(previous => ({ ...previous, [tab]: total }));
    invalidateReads(`summary:patients/${id}/summaries/records`);
    await db.doc(`patients/${id}/summaries/records`).update({ [`value.${tab}`]: total }).catch(() => {});
  }, [id, loadSection]);

  const fetchPatientData = useCallback(async (force = false) => {
    if (!id) return;
    if (force) invalidateReads(`patient:${id}`);
    if (!force) setLoading(true);
    try {
      const patientDoc = await cachedRead(`patient:${id}`, () => db.collection('patients').doc(id).get());
      if (currentPatientId.current !== id) return;
      if (!patientDoc.exists) { addNotification('Patient not found.', 'error'); navigate('/accounts/patients'); return; }
      let data = { ...patientDoc.data(), id: patientDoc.id } as Patient;
      if (['Admitted', 'PendingDischarge'].includes(data.status)) {
        const admissions = await db.collection('patients').doc(id).collection('admissionHistory').orderBy('admissionDate', 'desc').limit(1).get();
        const billed = await handleAutomaticBedBilling(data, admissions.docs.map(doc => ({ ...doc.data(), id: doc.id } as AdmissionRecord)));
        if (billed) { invalidateReads(); data = { ...(await db.collection('patients').doc(id).get()).data(), id } as Patient; }
      }
      if (currentPatientId.current !== id) return;
      setPatient(data); setFormData(data);
      if (data.registeredBy && data.registeredBy !== 'dummy_user_id') {
        const registrar = await cachedRead(`user:${data.registeredBy}`, () => db.collection('users').doc(data.registeredBy).get(), 300_000);
        if (currentPatientId.current === id) setRegistrarName(registrar.exists ? `${registrar.data()?.name} ${registrar.data()?.surname}` : 'Unknown Staff');
      } else setRegistrarName('Seeded Patient Data');
      patientRecordCounts(id).then(counts => { if (currentPatientId.current === id) setRecordCounts(counts); }).catch(() => {});
    } catch { addNotification('Failed to fetch patient data.', 'error'); }
    finally { if (currentPatientId.current === id) setLoading(false); }
  }, [id, addNotification, handleAutomaticBedBilling]);

  useEffect(() => { recordPages.current = {}; setPatient(null); setRecordCounts({}); fetchPatientData(); }, [fetchPatientData]);
  // Local snapshots render immediately; server changes update the visible page
  // without replacing its layout with a loading screen.
  const editingPatient = useRef(isEditing);
  editingPatient.current = isEditing;
  useEffect(() => {
    if (!id) return;
    return db.collection('patients').doc(id).onSnapshot(snapshot => {
      if (currentPatientId.current !== id || !snapshot.exists) return;
      const value = { ...snapshot.data(), id: snapshot.id } as Patient;
      setPatient(value);
      if (!editingPatient.current) setFormData(value);
      setLoading(false);
    }, () => {});
  }, [id]);
  useEffect(() => {
    if (!id || !isRecordsPage) return;
    const sources = activeTab === 'financials' ? ['bills', 'payments'] : activeTab === 'dispensed' ? ['dispensingRecords'] : patientSections[activeTab] || [];
    const setters: Record<string, (value: any[]) => void> = {
      doctorNotes: setDoctorNotes, nurseNotes: setNurseNotes, vitals: setVitals, labResults: setLabResults,
      radiologyResults: setRadiologyResults, rehabilitationNotes: setRehabNotes, prescriptions: setPrescriptions,
      dischargeSummaries: setDischargeSummaries, admissionHistory: setAdmissionHistory,
      bills: setBills, payments: setPayments, dispensingRecords: setDispensedMedication,
    };
    const stops = sources.map(source => {
      const global = ['bills', 'payments', 'dispensingRecords'].includes(source);
      const field = source === 'admissionHistory' ? 'admissionDate' : source === 'dispensingRecords' ? 'timestamp' : global ? 'date' : 'createdAt';
      const query = global ? db.collection(source).where(source === 'dispensingRecords' ? 'recipientPatientId' : 'patientId', '==', id) : db.collection('patients').doc(id).collection(source);
      let firstIds: Set<string> | undefined;
      return query.orderBy(field, 'desc').limit(PAGE_SIZE).onSnapshot(snapshot => {
        if (currentPatientId.current !== id || currentTab.current !== activeTab) return;
        const key = `${id}:${source}`;
        const previous = recordPages.current[key];
        const fresh = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        const ids = new Set(fresh.map(value => value.id));
        const previousFirstIds = firstIds || new Set((previous?.documents || []).slice(0, PAGE_SIZE).map(value => value.id));
        const historical = (previous?.documents || []).filter(value => !previousFirstIds.has(value.id) && !ids.has(value.id));
        firstIds = ids;
        const page = { documents: [...fresh, ...historical], loadedAt: Date.now(),
          cursor: historical.length ? previous?.cursor || null : snapshot.docs[snapshot.docs.length - 1] || null,
          more: historical.length ? previous?.more || false : snapshot.size === PAGE_SIZE };
        recordPages.current[key] = page;
        setters[source](page.documents);
        setRecordsLoading(false);
        setHasMoreRecords(sources.some(name => recordPages.current[`${id}:${name}`]?.more));
      }, failure => {
        const error = firestoreReadError(failure);
        setRecordError(error.message); setRecordIndexUrl(error.indexUrl); setRecordsLoading(false);
      });
    });
    return () => stops.forEach(stop => stop());
  }, [id, isRecordsPage, activeTab]);
  useEffect(() => { if (isRecordsPage) loadSection(activeTab); }, [isRecordsPage, activeTab, loadSection]);



  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!id) return;
    try {
        const updateData: any = {
            phoneNumber: formData.phoneNumber,
            residentialAddress: formData.residentialAddress,
            nokName: formData.nokName,
            nokSurname: formData.nokSurname,
            nokPhoneNumber: formData.nokPhoneNumber,
            nokAddress: formData.nokAddress,
        };
        if (formData.nationalId !== undefined) {
            updateData.nationalId = formData.nationalId;
        }
        await db.collection('patients').doc(id).update(updateData);
        addNotification('Patient profile updated successfully!', 'success');
        setIsEditing(false);
        fetchPatientData(true);
    } catch (error) {
        addNotification('Failed to update profile.', 'error');
    }
  };

  const handleInitiateDischarge = async () => {
    if (!id || !userProfile || !patient || patient.status !== 'Admitted') return;
    try {
      const patientRef = db.collection('patients').doc(id);
      const batch = db.batch();

      batch.update(patientRef, { 
        status: 'PendingDischarge',
        dischargeRequesterId: userProfile.id
      });

      const accountantsQuery = db.collection('users').where('role', '==', Role.Accountant).get();
      const assistantsQuery = db.collection('users').where('role', '==', Role.AccountsAssistant).get();
      const [accountantsSnapshot, assistantsSnapshot] = await Promise.all([accountantsQuery, assistantsQuery]);
      const recipients = [...accountantsSnapshot.docs, ...assistantsSnapshot.docs];

      recipients.forEach(doc => {
          const notificationRef = db.collection('notifications').doc();
          batch.set(notificationRef, {
              recipientId: doc.id,
              senderId: userProfile.id,
              senderName: `${userProfile.name} ${userProfile.surname}`,
              title: 'Discharge Request',
              message: `Discharge requested for patient ${patient?.name} ${patient?.surname} (${patient?.hospitalNumber}). Please review financials.`,
              type: 'system_alert',
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              read: false,
          });
      });

      await batch.commit();
      addNotification(`Patient status updated to PendingDischarge.`, 'success');
      fetchPatientData(true);
    } catch (error) {
      addNotification('Failed to update patient status.', 'error');
    }
  };

  const handlePrintFullReport = async () => {
      if (!patient || !id) return;
      const printWindow = window.open('', '_blank');
      addNotification('Preparing full patient report…', 'info');
      const paths = ['doctorNotes', 'nurseNotes', 'vitals', 'labResults', 'radiologyResults', 'rehabilitationNotes', 'prescriptions', 'dischargeSummaries', 'admissionHistory'];
      let snapshots: firebase.firestore.QuerySnapshot[];
      try { snapshots = await Promise.all(paths.map(path => db.collection('patients').doc(id).collection(path).get())); }
      catch { printWindow?.close(); addNotification('Could not load the full patient report.', 'error'); return; }
      const [doctorNotes, nurseNotes, vitals, labResults, radiologyResults, rehabNotes, prescriptions, dischargeSummaries, admissionHistory] = snapshots.map(snapshot => snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))) as [DoctorNote[], NurseNote[], Vitals[], LabResult[], RadiologyResult[], RehabilitationNote[], Prescription[], DischargeSummary[], AdmissionRecord[]];
      let financialSnapshots: firebase.firestore.QuerySnapshot[];
      try { financialSnapshots = await Promise.all([db.collection('bills').where('patientId', '==', id).get(), db.collection('payments').where('patientId', '==', id).get()]); }
      catch { printWindow?.close(); addNotification('Could not load the full patient report.', 'error'); return; }
      const [billSnapshot, paymentSnapshot] = financialSnapshots;
      const bills = billSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Bill));
      const payments = paymentSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Payment));

      const styles = `
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10pt; color: #000; background: #fff; }
        .container { width: 100%; padding: 20px; }
        h1 { font-size: 18pt; font-weight: bold; color: #2c3e50; border-bottom: 2px solid #2c3e50; padding-bottom: 10px; margin-bottom: 20px; }
        h2 { font-size: 14pt; font-weight: bold; color: #34495e; margin-top: 20px; margin-bottom: 10px; background-color: #f0f2f5; padding: 5px 10px; }
        h3 { font-size: 12pt; font-weight: bold; color: #555; margin-top: 15px; margin-bottom: 5px; }
        p { margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 9pt; }
        th, td { border: 1px solid #bdc3c7; padding: 6px; text-align: left; }
        th { background-color: #ecf0f1; font-weight: bold; }
        .section { margin-bottom: 30px; }
        .two-col { display: flex; justify-content: space-between; gap: 20px; }
        .col { flex: 1; }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 8pt; font-weight: bold; border: 1px solid #ccc; }
        .note { border: 1px solid #eee; padding: 10px; margin-bottom: 10px; background: #fdfdfd; }
        .empty-state { color: #888; font-style: italic; font-size: 9pt; }
        .amount { font-family: monospace; font-weight: bold; }
      `;

      // Helper to format date for print report in Zimbabwe Time
      const formatDate = formatRecordTimestamp;

      let htmlContent = `
        <div class="container">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1>RCZ MORGENSTER HOSPITAL</h1>
                <p style="font-size: 12pt;"><strong>CONFIDENTIAL PATIENT REPORT</strong></p>
                <p>Generated on: ${new Date().toLocaleString('en-GB', { timeZone: 'Africa/Harare' })}</p>
            </div>

            <div class="section">
                <table style="width: 100%; border: none; border-collapse: collapse;">
                    <tr>
                        <td style="width: 50%; vertical-align: top; border: none; padding-right: 15px;">
                            <h2 style="margin-top: 0;">Patient Demographics</h2>
                            <p><strong>Name:</strong> ${patient.name} ${patient.surname}</p>
                            <p><strong>Hospital No:</strong> ${patient.hospitalNumber}</p>
                            <p><strong>DOB:</strong> ${patient.dateOfBirth} (Age: ${patient.age})</p>
                            <p><strong>Gender:</strong> ${patient.gender}</p>
                            <p><strong>ID/Passport:</strong> ${patient.nationalId || patient.passportNumber || 'N/A'}</p>
                            <p><strong>Status:</strong> ${patient.status}</p>
                        </td>
                        <td style="width: 50%; vertical-align: top; border: none; padding-left: 15px;">
                            <h2 style="margin-top: 0;">Contact & NOK</h2>
                            <p><strong>Phone:</strong> ${patient.phoneNumber}</p>
                            <p><strong>Address:</strong> ${patient.residentialAddress}</p>
                            <p><strong>NOK Name:</strong> ${patient.nokName} ${patient.nokSurname}</p>
                            <p><strong>NOK Phone:</strong> ${patient.nokPhoneNumber}</p>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="section">
                <h2>Admission History</h2>
                ${admissionHistory.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Admission Date</th>
                                <th>Ward & Bed</th>
                                <th>Admitted By</th>
                                <th>Discharge Date</th>
                                <th>Discharged By</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${admissionHistory.map(a => `
                                <tr>
                                    <td>${formatDate(a.admissionDate)}</td>
                                    <td>${a.wardName} - Bed ${a.bedNumber}</td>
                                    <td>${a.admittedByName}</td>
                                    <td>${formatDate(a.dischargeDate)}</td>
                                    <td>${a.dischargedByName || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<p class="empty-state">No admission history recorded.</p>'}
            </div>
            
            <div class="section">
                <h2>Financial Details</h2>
                <table style="width: 100%; border-collapse: separate; border-spacing: 10px; margin-bottom: 20px;">
                    <tr>
                        <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 6px;">
                            <p style="font-size: 8pt; color: #64748b; text-transform: uppercase;">Total Bill</p>
                            <p style="font-size: 14pt; font-weight: bold; color: #0f172a;">$${patient.financials.totalBill.toFixed(2)}</p>
                        </td>
                        <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 6px;">
                            <p style="font-size: 8pt; color: #64748b; text-transform: uppercase;">Total Paid</p>
                            <p style="font-size: 14pt; font-weight: bold; color: #16a34a;">$${patient.financials.amountPaid.toFixed(2)}</p>
                        </td>
                        <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 6px;">
                            <p style="font-size: 8pt; color: #64748b; text-transform: uppercase;">Balance Due</p>
                            <p style="font-size: 14pt; font-weight: bold; color: ${patient.financials.balance > 0 ? '#dc2626' : '#16a34a'};">$${patient.financials.balance.toFixed(2)}</p>
                        </td>
                    </tr>
                </table>

                <h3>Detailed Billing History</h3>
                ${bills.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Bill ID</th>
                                <th>Items</th>
                                <th>Total</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${bills.map(b => `
                                <tr>
                                    <td>${formatDate(b.date)}</td>
                                    <td>${b.id?.substring(0,8)}</td>
                                    <td>${b.items.length} items (e.g. ${b.items[0]?.description}...)</td>
                                    <td><span class="amount">$${b.totalBill.toFixed(2)}</span></td>
                                    <td>${b.status}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<p class="empty-state">No bills recorded.</p>'}

                <h3>Payment History</h3>
                ${payments.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Method</th>
                                <th>Processed By</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${payments.map(p => `
                                <tr>
                                    <td>${formatDate(p.date)}</td>
                                    <td>${p.paymentMethod}</td>
                                    <td>${p.processedByName}</td>
                                    <td><span class="amount">$${p.amount.toFixed(2)}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<p class="empty-state">No payments recorded.</p>'}
            </div>

            <div class="section">
                <h2>Vitals History</h2>
                 ${vitals.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Temp (°C)</th>
                                <th>BP (mmHg)</th>
                                <th>HR (bpm)</th>
                                <th>RR (bpm)</th>
                                <th>Weight (kg)</th>
                                <th>Recorded By</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${vitals.map(v => `
                                <tr>
                                    <td>${formatDate(v.createdAt)}</td>
                                    <td>${v.temperature}</td>
                                    <td>${v.bloodPressure}</td>
                                    <td>${v.heartRate}</td>
                                    <td>${v.respiratoryRate}</td>
                                    <td>${v.weight}</td>
                                    <td>${v.recordedByName}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<p class="empty-state">No vitals recorded.</p>'}
            </div>

            <div class="section">
                <h2>Clinical Notes</h2>
                ${[...doctorNotes, ...nurseNotes].length > 0 ? [...doctorNotes, ...nurseNotes].sort(newestRecordFirst).map(note => `
                    <div class="note">
                        <p><strong>${note.authorName}</strong> <span style="color: #777; font-size: 8pt;">(${formatDate(note.createdAt)})</span></p>
                        ${note.clerkingSheet ? clerkingSheetPrintHtml(note, admissionHistory.find(record => record.id === note.admissionId)?.dischargeDate) : ''}
                        ${!note.clerkingSheet && note.medicalNotes ? `<p><strong>Medical Notes:</strong> ${note.medicalNotes}</p>` : ''}
                        ${note.diagnosis ? `<p><strong>Diagnosis:</strong> ${note.diagnosis}</p>` : ''}
                    </div>
                `).join('') : '<p class="empty-state">No clinical notes recorded.</p>'}
            </div>

            <div class="section">
                <h2>Prescriptions</h2>
                ${prescriptions.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Medication</th>
                                <th>Dosage</th>
                                <th>Instructions</th>
                                <th>Prescriber</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${prescriptions.map(p => `
                                <tr>
                                    <td>${formatDate(p.createdAt)}</td>
                                    <td>${p.medication}</td>
                                    <td>${p.dosage}</td>
                                    <td>${p.instructions}</td>
                                    <td>${p.authorName}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<p class="empty-state">No prescriptions recorded.</p>'}
            </div>

            <div class="section">
                <h2>Laboratory Results</h2>
                ${labResults.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Test Name</th>
                                <th>Result</th>
                                <th>Notes</th>
                                <th>Technician</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${labResults.map(r => `
                                <tr>
                                    <td>${formatDate(r.createdAt)}</td>
                                    <td>${r.testName}</td>
                                    <td>${r.resultValue}</td>
                                    <td>${r.notes}</td>
                                    <td>${r.technicianName || 'N/A'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<p class="empty-state">No lab results recorded.</p>'}
            </div>

            <div class="section">
                <h2>Radiology Results</h2>
                ${radiologyResults.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Image Description</th>
                                <th>Findings</th>
                                <th>Radiologist</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${radiologyResults.map(r => `
                                <tr>
                                    <td>${formatDate(r.createdAt)}</td>
                                    <td>${r.imageDescription}</td>
                                    <td>${r.findings}</td>
                                    <td>${r.radiologistName || 'N/A'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<p class="empty-state">No radiology results recorded.</p>'}
            </div>

            <div class="section">
                <h2>Rehabilitation Notes</h2>
                ${rehabNotes.length > 0 ? rehabNotes.map(n => `
                    <div class="note">
                        <p><strong>${n.authorName}</strong> <span style="color: #777; font-size: 8pt;">(${formatDate(n.createdAt)})</span></p>
                        <p>${n.content}</p>
                    </div>
                `).join('') : '<p class="empty-state">No rehabilitation notes recorded.</p>'}
            </div>

            <div class="section">
                <h2>Discharge Summaries</h2>
                ${dischargeSummaries.length > 0 ? dischargeSummaries.map(s => `
                    <div class="note">
                         <p><strong>${s.authorName}</strong> <span style="color: #777; font-size: 8pt;">(${formatDate(s.createdAt)})</span></p>
                         <p>${s.summary}</p>
                    </div>
                `).join('') : '<p class="empty-state">No discharge summaries recorded.</p>'}
            </div>
        </div>
      `;

    const finalHTML = `
        <!DOCTYPE html>
        <html>
            <head><meta charset='utf-8'><title>Patient Report</title><style>${styles}</style></head>
            <body>${htmlContent}</body>
        </html>
    `;

    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(finalHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = `Report_${patient.name}_${patient.surname}.doc`;
    fileDownload.click();
    document.body.removeChild(fileDownload);

    addNotification('Report downloading. Opening print dialog...', 'info');
    
    if(printWindow) {
        printWindow.document.write(finalHTML);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    }
  };

  const openModal = (modalName: keyof typeof modalState, itemToEdit: any | null = null) => {
    setEditingItem(itemToEdit);
    setModalState(prev => ({ ...prev, [modalName]: true }));
  };

  const openClinicalNoteModal = (type: 'doctor' | 'nurse') => {
    setNoteTypeToAdd(type);
    openModal('clinicalNote');
  };

  const closeModal = (modalName: keyof typeof modalState) => {
    setModalState(prev => ({ ...prev, [modalName]: false }));
    setEditingItem(null);
  };
  
  const canEditProfile = userProfile?.role === Role.Accountant || userProfile?.role === Role.AccountsClerk;
  const canMakePayment = userProfile?.role === Role.Accountant || userProfile?.role === Role.AccountsClerk;
  const canPrintReport = [Role.Admin, Role.Accountant, Role.AccountsAssistant, Role.AccountsClerk].includes(userProfile?.role || '' as Role);
  
  const permissions = {
      canAddClerkingSheet: canAddClerkingSheet(userProfile?.role),
      canAddDoctorNote: userProfile?.role === Role.Doctor,
      canAddNurseNote: userProfile?.role === Role.Nurse,
      canManageAdmission: userProfile?.role === Role.Doctor || userProfile?.role === Role.Nurse,
      canAddVitals: userProfile?.role === Role.VitalsChecker || userProfile?.role === Role.Nurse,
      canAddLabResult: userProfile?.role === Role.LaboratoryTechnician,
      canAddRadiologyResult: userProfile?.role === Role.Radiologist,
      canAddEditRehabNote: userProfile?.role === Role.RehabilitationTechnician,
      canAddEditPrescription: userProfile?.role === Role.Doctor || userProfile?.role === Role.Nurse,
      canAddEditDischargeSummary: userProfile?.role === Role.Doctor || userProfile?.role === Role.Nurse,
  };


    if (loading && !patient) return <PatientProfileSkeleton records={isRecordsPage} section={activeTab} />;
  if (!patient) return null;

    if (isClerkingSheetPage && permissions.canAddClerkingSheet) {
        return <ClerkingSheetPage patient={patient} onBack={() => navigate(`/patients/${id}`)} onSaved={hasVitals => {
            refreshSection('clinical');
            if (hasVitals) {
                delete recordPages.current[`${id}:vitals`];
                countRecords(`patients/${id}/vitals`).then(total => {
                    if (currentPatientId.current === id) setRecordCounts(previous => ({ ...previous, vitals: total }));
                }).catch(() => {});
            }
        }} />;
    }

  return (
    <div className={isRecordsPage ? 'space-y-6' : 'h-full min-h-0'}>
        {!isRecordsPage && <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:grid-cols-[minmax(0,1fr)_400px] grid-rows-2 lg:grid-rows-1">
            <div className="patient-panel-scroll min-w-0 min-h-0 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6 md:p-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-gray-400">
            <Link to="/accounts/patients" className="font-medium text-sky-400 hover:text-sky-300">Patients List</Link>
            <span aria-hidden="true">/</span>
            <span className="text-gray-200">{patient.name} {patient.surname}</span>
        </nav>
        <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-4">
            <div>
                <h1 className="text-3xl font-bold text-white">{patient.name} {patient.surname}</h1>
                <p className="text-sm text-gray-400 mt-1">Hospital No: {patient.hospitalNumber}</p>
                 {patient.status === 'Admitted' && patient.currentWardName && (
                    <p className="text-sm font-semibold text-sky-400 mt-1 flex items-center gap-2"><Bed size={16}/>{patient.currentWardName} - Bed {patient.currentBedNumber}</p>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {canPrintReport && (
                    <button onClick={handlePrintFullReport} className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-purple-700 hover:shadow-lg hover:shadow-purple-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400">
                        <Printer size={16} /> Print Full Report
                    </button>
                )}
                {permissions.canAddClerkingSheet && (
                    <button onClick={() => navigate(`/patients/${id}/clerking-sheet`)} className="flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-sky-700 hover:shadow-lg hover:shadow-sky-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
                        <FilePlus size={16} /> Add Clerking Sheet
                    </button>
                )}
                {canMakePayment && (
                    <button onClick={() => openModal('payment')} className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-green-700 hover:shadow-lg hover:shadow-green-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400">
                        <PlusCircle size={16} /> Make Payment
                    </button>
                )}
                {canEditProfile && !isEditing && (
                    <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-sky-700 hover:shadow-lg hover:shadow-sky-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
                        <Edit size={16} /> Edit Profile
                    </button>
                )}
                 {isEditing && (
                    <div className="flex gap-2">
                        <button onClick={handleSave} className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-green-700 hover:shadow-lg hover:shadow-green-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400">
                            <Save size={16} /> Save
                        </button>
                        <button onClick={() => { setIsEditing(false); setFormData(patient); }} className="flex items-center gap-2 rounded-md bg-gray-700 px-4 py-2 text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-600 hover:shadow-lg hover:shadow-gray-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
                           <X size={16} /> Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
      
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start min-w-0">
            {/* Patient identity */}
            <div className="bg-[#161B22] border border-gray-700 rounded-xl p-6 text-center h-full">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-sky-500/15 text-2xl font-bold text-sky-400 ring-4 ring-sky-500/5">
                    {patient.name?.charAt(0)}{patient.surname?.charAt(0)}
                </div>
                <h2 className="text-xl font-semibold text-white break-words">{patient.name} {patient.surname}</h2>
                <p className="mt-1 text-sm text-gray-400">Hospital No: {patient.hospitalNumber}</p>
                <span className={`mt-4 inline-flex px-3 py-1 text-xs font-semibold rounded-full ${statusClasses[patient.status]}`}>
                    {patient.status === 'PendingDischarge' ? 'Pending Discharge' : patient.status}
                </span>
                <div className="mt-6 grid grid-cols-2 gap-4 border-t border-gray-700 pt-4">
                    <div><p className="text-xs text-gray-400">Total Paid</p><p className="mt-1 font-semibold text-green-400">${patient.financials.amountPaid.toFixed(2)}</p></div>
                    <div><p className="text-xs text-gray-400">Balance Due</p><p className={`mt-1 font-semibold ${patient.financials.balance > 0 ? 'text-red-400' : 'text-white'}`}>${patient.financials.balance.toFixed(2)}</p></div>
                </div>
                <button onClick={() => openRecords('financials')} className="mt-5 w-full rounded-lg bg-gray-800 px-4 py-2 text-sm text-sky-400 hover:bg-gray-700">View Financials</button>
            </div>

            {/* Reports overview */}
            <div className="bg-[#161B22] border border-gray-700 rounded-xl h-full overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-gray-700">
                    <h3 className="text-base font-semibold text-white">Reports & Records</h3>
                    <FileClock size={18} className="text-sky-400" />
                </div>
                <div className="divide-y divide-gray-700/60">
                    {[
                        { label: 'Clinical Notes', tab: 'clinical', count: recordCounts.clinical ?? 0, icon: Clipboard },
                        { label: 'Laboratory Results', tab: 'labs', count: recordCounts.labs ?? 0, icon: Microscope },
                        { label: 'Radiology Reports', tab: 'radiology', count: recordCounts.radiology ?? 0, icon: Bone },
                        { label: 'Prescriptions', tab: 'prescriptions', count: recordCounts.prescriptions ?? 0, icon: Pill },
                        { label: 'Dispensed Medication', tab: 'dispensed', count: recordCounts.dispensed ?? 0, icon: Pill },
                        { label: 'Discharge Summaries', tab: 'discharge', count: recordCounts.discharge ?? 0, icon: ClipboardCheck },
                    ].map(({ label, tab, count, icon: Icon }) => (
                        <button key={tab} onClick={() => openRecords(tab)} className="flex w-full items-center gap-3 px-6 py-4 text-left text-sm hover:bg-gray-800/70 transition-colors">
                            <Icon size={16} className="shrink-0 text-sky-400" />
                            <span className="flex-1 text-gray-300">{label}</span>
                            <span className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-400">{count}</span>
                        </button>
                    ))}
                </div>
            </div>
            </div>
            </div>
            {/* Personal and contact details */}
            <aside aria-label="Patient details" tabIndex={0} className="patient-panel-scroll min-w-0 min-h-0 h-full rounded-none border-l border-gray-700 bg-[#161B22] overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500">
                <div className="p-6">
                    <h3 className="text-base font-semibold text-white mb-5">Patient Details</h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                        <DetailItem label="Gender" value={patient.gender} />
                        <DetailItem label="Date of Birth" value={patient.dateOfBirth} />
                        <DetailItem label="Age" value={patient.age} />
                        <DetailItem label="Mobile Number" name="phoneNumber" value={formData.phoneNumber} isEditing={isEditing} onChange={handleChange} />
                        <div className="col-span-2"><DetailItem label="Residential Address" name="residentialAddress" value={formData.residentialAddress} isEditing={isEditing} onChange={handleChange} /></div>
                        <DetailItem label={patient.passportNumber ? 'Passport Number' : 'National ID'} value={patient.passportNumber || patient.nationalId} />
                    </div>
                </div>

                <div>
                    <div className="px-6 pb-6 space-y-6">
                        <div className="space-y-4 pt-6 border-t border-gray-700">
                            <DetailItem label="Date of Birth" value={patient.dateOfBirth} />
                            <DetailItem label="Marital Status" value={patient.maritalStatus} />
                            {patient.nationality === 'Zimbabwean' ? (
                                <DetailItem label="National ID" name="nationalId" value={formData.nationalId} isEditing={isEditing} onChange={handleChange} icon={<Fingerprint size={16}/>}/>
                            ) : (
                                <DetailItem label="Passport Number" name="passportNumber" value={formData.passportNumber} isEditing={isEditing} onChange={handleChange} icon={<Fingerprint size={16}/>}/>
                            )}
                        </div>
                        <hr className="border-gray-700"/>
                        <div>
                            <h3 className="text-md font-semibold text-white mb-4 flex items-center"><Phone size={16} className="mr-2 text-sky-400"/> Contact Information</h3>
                            <div className="space-y-4">
                                <DetailItem label="Phone Number" name="phoneNumber" value={formData.phoneNumber} isEditing={isEditing} onChange={handleChange} />
                                <DetailItem label="Residential Address" name="residentialAddress" value={formData.residentialAddress} isEditing={isEditing} onChange={handleChange} />
                            </div>
                        </div>
                        <hr className="border-gray-700"/>
                        <div>
                            <h3 className="text-md font-semibold text-white mb-4 flex items-center"><Heart size={16} className="mr-2 text-sky-400"/> Next of Kin</h3>
                            <div className="space-y-4">
                                {isEditing ? (
                                    <>
                                        <DetailItem label="NOK First Name" name="nokName" value={formData.nokName} isEditing={isEditing} onChange={handleChange} />
                                        <DetailItem label="NOK Last Name" name="nokSurname" value={formData.nokSurname} isEditing={isEditing} onChange={handleChange} />
                                    </>
                                ) : (
                                    <DetailItem label="NOK Full Name" value={`${patient.nokName} ${patient.nokSurname}`} />
                                )}
                                <DetailItem label="NOK Phone Number" name="nokPhoneNumber" value={formData.nokPhoneNumber} isEditing={isEditing} onChange={handleChange} />
                                <DetailItem label="NOK Address" name="nokAddress" value={formData.nokAddress} isEditing={isEditing} onChange={handleChange} />
                            </div>
                        </div>
                    </div>
                </div>
                

                <div className="border-t border-gray-700 px-6 py-5 space-y-4">
                    <DetailItem label="Registration Date" value={formatRecordTimestamp(patient.registrationDate)} icon={<Calendar size={18} />} />
                    <DetailItem label="Registered by:" value={registrarName} icon={<RegistrationIcon size={18} />} />
                </div>
            </aside>

        </div>}

        {isRecordsPage && <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-4">
                <button onClick={() => navigate(`/patients/${id}`)} className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">
                    <ArrowLeft size={16} /> Back to Patient Profile
                </button>
                <p className="text-sm text-gray-400">{patient.name} {patient.surname} · {patient.hospitalNumber}</p>
            </div>

                <div className="sticky -top-4 sm:-top-6 md:-top-8 z-30 -mx-4 sm:-mx-6 md:-mx-8 border-b border-gray-700 bg-[#0D1117] px-4 sm:px-6 md:px-8 pt-4 sm:pt-6 md:pt-8 shadow-sm">
                    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Patient record tabs">
                        {[
                            { tab: 'clinical', label: 'Clinical Notes', count: recordCounts.clinical ?? 0 },
                            { tab: 'vitals', label: 'Vitals', count: recordCounts.vitals ?? 0 },
                            { tab: 'prescriptions', label: 'Prescriptions', count: recordCounts.prescriptions ?? 0 },
                            { tab: 'dispensed', label: 'Dispensed Medication', count: recordCounts.dispensed ?? 0 },
                            { tab: 'labs', label: 'Laboratory', count: recordCounts.labs ?? 0 },
                            { tab: 'radiology', label: 'Radiology', count: recordCounts.radiology ?? 0 },
                            { tab: 'rehab', label: 'Rehabilitation', count: recordCounts.rehab ?? 0 },
                            { tab: 'admissions', label: 'Admissions', count: recordCounts.admissions ?? 0 },
                            { tab: 'discharge', label: 'Discharge', count: recordCounts.discharge ?? 0 },
                            { tab: 'financials', label: 'Financials', count: recordCounts.financials ?? 0 },
                        ].map(({ tab, label, count }) => (
                            <TabButton key={tab} active={activeTab === tab} onClick={() => openRecords(tab)}>
                                <span className="inline-flex items-center gap-2">
                                    {label}
                                    <span aria-label={`${count} records`} className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${activeTab === tab ? 'bg-sky-500/20 text-sky-300' : 'bg-gray-800 text-gray-400'}`}>{count}</span>
                                </span>
                            </TabButton>
                        ))}
                    </nav>
                </div>
                <div className="mt-6">
                    {loading || recordsLoading ? <PatientProfileSkeleton records section={activeTab} contentOnly /> : <>
                    {activeTab === 'financials' && <FinancialsView patient={patient} bills={bills} payments={payments} />}
                    
                    {activeTab !== 'financials' && <MedicalHistoryView section={activeTab} patient={patient} permissions={permissions} data={{ doctorNotes, nurseNotes, vitals, labResults, radiologyResults, rehabNotes, prescriptions, dispensedMedication, dischargeSummaries, admissionHistory }} openModal={openModal} openClinicalNoteModal={openClinicalNoteModal} openClerkingSheet={() => navigate(`/patients/${id}/clerking-sheet`)} onInitiateDischarge={handleInitiateDischarge} statusClasses={statusClasses} />}

                    </>}
                    {recordError && <div className="mt-4 flex items-center gap-3"><p role="alert" className="text-sm text-red-400">{recordError}</p><DatabaseIndexLink url={recordIndexUrl} /><button onClick={() => loadSection(activeTab, false, true)} className="text-sm text-sky-400">Retry</button></div>}
                    {hasMoreRecords && !recordError && <button disabled={recordsLoading} onClick={() => loadSection(activeTab, true)} className="mt-5 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 disabled:opacity-50">{recordsLoading ? 'Loading…' : 'Load More'}</button>}
                </div>
        </div>}
        
        {/* All Modals */}
        {patient && <AdmitPatientModal isOpen={modalState.admit} onClose={() => closeModal('admit')} patientId={patient.id!} onSuccess={() => { fetchPatientData(true); refreshSection('admissions'); }} />}
        {canMakePayment && <MakePaymentModal isOpen={modalState.payment} onClose={() => closeModal('payment')} patient={patient} onPaymentSuccess={() => { fetchPatientData(true); refreshSection('financials'); }} />}
        {patient && <ClinicalNoteModal isOpen={modalState.clinicalNote} onClose={() => closeModal('clinicalNote')} noteType={noteTypeToAdd} patientId={patient.id!} onNoteAdded={() => refreshSection('clinical')} />}
        {patient && permissions.canAddVitals && <AddVitalsModal isOpen={modalState.vitals} onClose={() => closeModal('vitals')} patientId={patient.id!} onSuccess={() => refreshSection('vitals')} />}
        {patient && permissions.canAddLabResult && <GenericNoteModal isOpen={modalState.labResult} onClose={() => closeModal('labResult')} patientId={patient.id!} onSuccess={() => refreshSection('labs')} collectionName="labResults" title="Lab Result" />}
        {patient && permissions.canAddRadiologyResult && <GenericNoteModal isOpen={modalState.radiologyResult} onClose={() => closeModal('radiologyResult')} patientId={patient.id!} onSuccess={() => refreshSection('radiology')} collectionName="radiologyResults" title="Radiology Result" />}
        {patient && permissions.canAddEditRehabNote && <GenericNoteModal isOpen={modalState.rehabNote} onClose={() => closeModal('rehabNote')} patientId={patient.id!} onSuccess={() => refreshSection('rehab')} collectionName="rehabilitationNotes" title="Rehabilitation Note" existingNote={editingItem} />}
        {patient && permissions.canAddEditPrescription && <GenericNoteModal isOpen={modalState.prescription} onClose={() => closeModal('prescription')} patientId={patient.id!} onSuccess={() => refreshSection('prescriptions')} collectionName="prescriptions" title="Prescription" existingNote={editingItem} />}
        {patient && permissions.canAddEditDischargeSummary && <GenericNoteModal isOpen={modalState.dischargeSummary} onClose={() => closeModal('dischargeSummary')} patientId={patient.id!} onSuccess={() => refreshSection('discharge')} collectionName="dischargeSummaries" title="Discharge Summary" existingNote={editingItem} />}
    </div>
  );
};

export default PatientProfile;