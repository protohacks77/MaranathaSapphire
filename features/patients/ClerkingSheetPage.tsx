import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, FileText, Save, UserRound } from 'lucide-react';
import { Patient } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { historyFields, initialClerkingSheet, measurementFields, saveClerkingSheet } from './clerkingSheet';

const demographics = [
    ['patientName', 'Patient name'], ['age', 'Age'], ['sex', 'Sex'], ['phone', 'Cell phone'],
    ['address', 'Address'], ['nextOfKinPhone', 'Next-of-kin phone'], ['medicalAid', 'Medical aid'], ['medicalAidNumber', 'Medical aid number'],
] as const;
const sexOptions = ['Male', 'Female', 'Other'] as const;

const steps = [
    { label: 'Patient Details', icon: UserRound },
    { label: 'History', icon: FileText },
    { label: 'Examination', icon: Check },
];

type ClerkingSheetPageProps = {
    patient: Patient;
    onBack: () => void;
    onSaved: (hasVitals: boolean) => void;
};

const ClerkingSheetPage: React.FC<ClerkingSheetPageProps> = ({ patient, onBack, onSaved }) => {
    const [form, setForm] = useState(() => initialClerkingSheet(patient));
    const [activeStep, setActiveStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [sexOpen, setSexOpen] = useState(false);
    const sexMenuRef = useRef<HTMLDivElement>(null);
    const { userProfile } = useAuth();
    const { addNotification } = useNotification();

    useEffect(() => {
        if (!sexOpen) return;
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (sexMenuRef.current && !sexMenuRef.current.contains(event.target as Node)) setSexOpen(false);
        };
        document.addEventListener('mousedown', closeOnOutsideClick);
        return () => document.removeEventListener('mousedown', closeOnOutsideClick);
    }, [sexOpen]);

    const change = (key: keyof typeof form, value: string) => {
        setForm(previous => ({ ...previous, [key]: value }));
        if (error) setError('');
    };

    const validateStep = () => {
        if (activeStep === 0) {
            if (!form.presentationAt) return 'Enter the presentation date and time.';
            if (!Number.isFinite(new Date(`${form.presentationAt}:00+02:00`).getTime())) return 'Enter a valid presentation date and time.';
        }
        if (activeStep === 1 && !form.presentingComplaint.trim()) return 'Enter the presenting complaint before continuing.';
        if (activeStep === 2) {
            for (const [field, label] of measurementFields) {
                if (field === 'bloodPressure' || !form[field].trim()) continue;
                const number = Number(form[field]);
                if (!Number.isFinite(number) || number <= 0 || (field === 'oxygenSaturation' && number > 100)) {
                    return `Enter a valid ${label.toLowerCase()}.`;
                }
            }
        }
        return '';
    };

    const goNext = () => {
        const validationError = validateStep();
        if (validationError) {
            setError(validationError);
            return;
        }
        setError('');
        setActiveStep(previous => Math.min(previous + 1, steps.length - 1));
    };

    const goBack = () => {
        setError('');
        if (activeStep === 0) onBack();
        else setActiveStep(previous => previous - 1);
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!userProfile || saving) return;
        const validationError = validateStep();
        if (validationError) {
            setError(validationError);
            return;
        }
        setSaving(true);
        setError('');
        try {
            const result = await saveClerkingSheet(patient.id!, form, userProfile);
            addNotification('Clerking sheet saved.', 'success');
            onSaved(result.hasVitals);
            onBack();
        } catch (submitError: any) {
            setError(submitError.message || 'Could not save the clerking sheet.');
        } finally {
            setSaving(false);
        }
    };

    const preventImplicitSubmit = (event: React.KeyboardEvent<HTMLFormElement>) => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
    };

    const StepIcon = steps[activeStep].icon;

    return (
        <div className="min-h-full bg-[#0D1117] px-4 py-3 sm:px-6 md:px-8 md:py-4 lg:h-full lg:overflow-hidden">
            <div className="w-full lg:flex lg:h-full lg:flex-col">
                <button type="button" onClick={onBack} disabled={saving} className="mb-3 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50">
                    <ArrowLeft size={18} /> Back to Patient Profile
                </button>

                <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <header className="md:w-2/5">
                        <p className="text-sm font-medium text-sky-400">{patient.name} {patient.surname} · {patient.hospitalNumber}</p>
                        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Add Clerking Sheet</h1>
                    </header>

                    <nav aria-label="Clerking sheet progress" className="md:ml-auto md:w-1/2">
                        <div className="relative grid grid-cols-3 gap-2">
                        <div className="absolute left-[16.67%] right-[16.67%] top-4 h-px bg-gray-700" aria-hidden="true">
                            <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${(activeStep / (steps.length - 1)) * 100}%` }} />
                        </div>
                        {steps.map((step, index) => {
                            const Icon = step.icon;
                            const complete = index < activeStep;
                            const current = index === activeStep;
                            return (
                                <div key={step.label} className="relative z-10 flex flex-col items-center text-center">
                                    <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${complete || current ? 'border-sky-400 bg-sky-500 text-white' : 'border-gray-600 bg-[#0D1117] text-gray-500'}`}>
                                        {complete ? <Check size={18} /> : <Icon size={17} />}
                                    </span>
                                    <span className={`mt-1 text-xs font-semibold sm:text-sm ${current ? 'text-white' : complete ? 'text-sky-300' : 'text-gray-500'}`}>{step.label}</span>
                                </div>
                            );
                        })}
                        </div>
                    </nav>
                </div>

                <form onSubmit={submit} onKeyDown={preventImplicitSubmit} className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                    <section key={activeStep} className="patient-panel-scroll clerking-step-in rounded-xl border border-gray-700 bg-[#161B22] p-4 shadow-xl sm:p-6 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
                        <div className="mb-4 border-b border-gray-700 pb-4">
                            <div className="flex items-center gap-3">
                                <StepIcon size={21} className="text-sky-400" />
                                <h2 className="text-xl font-semibold text-white">{steps[activeStep].label}</h2>
                            </div>
                        </div>

                        {activeStep === 0 && (
                            <div className="space-y-4">
                                <div>
                                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-300">Patient details</h3>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        {demographics.map(([key, label]) => <label key={key} className="text-sm text-gray-400">
                                            {label}
                                            {key === 'sex' ? (
                                                <span ref={sexMenuRef} className="relative mt-1 block">
                                                    <button type="button" aria-haspopup="listbox" aria-expanded={sexOpen} onClick={() => setSexOpen(previous => !previous)} className="modern-input flex w-full items-center justify-between text-left font-medium text-gray-200 transition-all duration-200 hover:border-gray-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
                                                        <span className={form[key] ? 'text-gray-200' : 'text-gray-500'}>{form[key] || 'Select sex'}</span>
                                                        <ChevronDown size={17} aria-hidden="true" className={`text-sky-400 transition-transform duration-200 ${sexOpen ? 'rotate-180' : ''}`} />
                                                    </button>
                                                    {sexOpen && <div role="listbox" aria-label="Sex" className="sex-dropdown-in absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-gray-600/80 bg-[#1C2430] p-1.5 shadow-2xl shadow-black/40">
                                                        {sexOptions.map(option => <button key={option} type="button" role="option" aria-selected={form[key] === option} onClick={() => { change(key, option); setSexOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${form[key] === option ? 'bg-sky-500/15 text-sky-300' : 'text-gray-300 hover:bg-gray-700/70 hover:text-white'}`}>
                                                            <span>{option}</span>
                                                            {form[key] === option && <Check size={16} className="text-sky-400" />}
                                                        </button>)}
                                                    </div>}
                                                </span>
                                            ) : (
                                                <input value={form[key]} onChange={event => change(key, event.target.value)} className="modern-input mt-1 w-full" />
                                            )}
                                        </label>)}
                                    </div>
                                    <p className="mt-2 text-xs text-gray-500">Patient details are saved with this visit’s sheet.</p>
                                </div>
                                <label className="block max-w-xl text-sm text-gray-400">Date and time (Harare)<input required type="datetime-local" value={form.presentationAt} onChange={event => change('presentationAt', event.target.value)} className="modern-input mt-1 w-full" /></label>
                            </div>
                        )}

                        {activeStep === 1 && (
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                {historyFields.slice(0, 4).map(([key, label]) => <label key={key} className="block text-sm text-gray-400">{label}<textarea required={key === 'presentingComplaint'} rows={3} value={form[key]} onChange={event => change(key, event.target.value)} className="modern-input mt-1 w-full resize-y" /></label>)}
                            </div>
                        )}

                        {activeStep === 2 && (
                            <div className="space-y-4">
                                <div>
                                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-300">Examination measurements</h3>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                        {measurementFields.map(([key, label, unit]) => <label key={key} className="text-sm text-gray-400">{label} ({unit})<input type={key === 'bloodPressure' ? 'text' : 'number'} step="any" min="0" max={key === 'oxygenSaturation' ? 100 : undefined} placeholder={key === 'bloodPressure' ? '120/80' : undefined} value={form[key]} onChange={event => change(key, event.target.value)} className="modern-input mt-1 w-full" /></label>)}
                                    </div>
                                    <p className="mt-2 text-xs text-gray-500">Entered measurements will also appear in Vitals.</p>
                                </div>
                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Examination findings</h3>
                                    <div className="hidden lg:block" />
                                    {historyFields.slice(4).map(([key, label]) => <label key={key} className="block text-sm text-gray-400">{label}<textarea rows={3} value={form[key]} onChange={event => change(key, event.target.value)} className="modern-input mt-1 w-full resize-y" /></label>)}
                                </div>
                                <p className="text-xs text-gray-500">Discharge date and time will appear from the linked admission when recorded.</p>
                            </div>
                        )}
                    </section>

                    {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <button type="button" onClick={goBack} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:border-gray-500 hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50">
                            <ArrowLeft size={16} /> {activeStep === 0 ? 'Cancel' : 'Back'}
                        </button>
                        {activeStep < steps.length - 1 ? (
                            <button key="next-step" type="button" onClick={goNext} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-900/20 transition-all hover:-translate-y-0.5 hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
                                Next <ArrowRight size={16} />
                            </button>
                        ) : (
                            <button key="save-sheet" type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-900/20 transition-all hover:-translate-y-0.5 hover:bg-green-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 disabled:cursor-wait disabled:opacity-60">
                                <Save size={16} /> {saving ? 'Saving...' : 'Save Clerking Sheet'}
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ClerkingSheetPage;
