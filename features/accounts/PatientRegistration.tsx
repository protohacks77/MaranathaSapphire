import { patientSearchFields } from '../../services/patientSearch';
import { invalidateReads } from '../../services/readCache';
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { Patient, Role } from '../../types';
import { User, PlusCircle, Globe, Fingerprint, MapPin, Phone, Briefcase } from 'lucide-react';
import LoadingSpinner from '../../components/utils/LoadingSpinner';

const countryCodes = [
    { code: '+263', country: 'Zimbabwe' },
    { code: '+27', country: 'South Africa' },
    { code: '+44', country: 'UK' },
    { code: '+1', country: 'USA' },
    { code: '+267', country: 'Botswana' },
    { code: '+260', country: 'Zambia' },
    { code: '+258', country: 'Mozambique' },
];

const nationalities = [
    'Zimbabwean', 'South African', 'British', 'American', 'Motswana', 'Zambian', 'Mozambican', 'Other'
];

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="mb-8 bg-[#161B22] border border-gray-700 p-6 rounded-xl shadow-lg relative overflow-hidden group">
    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
        {React.cloneElement(icon as React.ReactElement<any>, { size: 100 })}
    </div>
    <h2 className="text-xl font-bold text-sky-400 mb-6 flex items-center gap-3 border-b border-gray-700 pb-3">
      {icon} {title}
    </h2>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
      {children}
    </div>
  </div>
);

const InputField: React.FC<{ 
    label: string; 
    name: string; 
    value: string; 
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void; 
    type?: string; 
    required?: boolean; 
    error?: string;
    placeholder?: string;
    pattern?: string;
}> = ({ label, name, value, onChange, type = 'text', required = false, error, placeholder, pattern }) => (
  <div>
    <label htmlFor={name} className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">{label} {required && <span className="text-red-500">*</span>}</label>
    <input 
        type={type} 
        name={name} 
        id={name} 
        value={value} 
        onChange={onChange} 
        required={required}
        placeholder={placeholder}
        pattern={pattern}
        className={`modern-input ${error ? 'error' : ''}`} 
    />
    {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
  </div>
);

const SelectField: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void; options: string[]; required?: boolean; }> = 
({ label, name, value, onChange, options, required = false }) => (
    <div>
        <label htmlFor={name} className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">{label} {required && <span className="text-red-500">*</span>}</label>
        <select name={name} id={name} value={value} onChange={onChange} required={required} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white modern-select focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer">
            <option value="">Select...</option>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
    </div>
);


const PatientRegistration: React.FC = () => {
    const { userProfile, loading: authLoading } = useAuth();
    const { addNotification } = useNotification();
    const navigate = useNavigate();
    const [formStatus, setFormStatus] = useState<'idle' | 'loading' | 'success'>('idle');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const isAuthorized = useMemo(() => {
        if (!userProfile) return false;
        return [Role.Accountant, Role.AccountsAssistant, Role.AccountsClerk].includes(userProfile.role);
    }, [userProfile]);

    useEffect(() => {
        if (!authLoading && !isAuthorized) {
            addNotification('You do not have permission to access this page.', 'error');
            navigate('/');
        }
    }, [authLoading, isAuthorized, navigate, addNotification]);

    const initialFormState = {
        name: '', surname: '', nationalId: '', passportNumber: '', nationality: 'Zimbabwean',
        dateOfBirth: '', maritalStatus: '', gender: '', countryOfBirth: 'Zimbabwe',
        phoneCountryCode: '+263', phoneNumber: '', residentialAddress: '', 
        nokName: '', nokSurname: '', nokPhoneNumber: '', nokAddress: ''
    };
    const [formData, setFormData] = useState(initialFormState);

    const age = useMemo(() => {
        if (!formData.dateOfBirth) return 0;
        const birthDate = new Date(formData.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }, [formData.dateOfBirth]);
    
    // Real-time Validation
    const validateField = (name: string, value: string) => {
        let error = '';
        if (name === 'name' || name === 'surname' || name === 'nokName' || name === 'nokSurname') {
            if (/[^a-zA-Z\s]/.test(value)) error = 'Only letters and spaces allowed.';
        }
        if (name === 'phoneNumber' || name === 'nokPhoneNumber') {
            // Must start with 7 and be 9 digits total (e.g. 774123456)
            if (!/^[7][0-9]{8}$/.test(value)) error = 'Must be 9 digits starting with 7 (e.g., 774123456).';
        }
        if (name === 'dateOfBirth') {
             const birthDate = new Date(value);
             const today = new Date();
             if (birthDate > today) error = 'Date of birth cannot be in the future.';
        }
        setErrors(prev => ({ ...prev, [name]: error }));
        return error === '';
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        validateField(name, value);
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const generateHospitalNumber = async (): Promise<string> => {
        const counterRef = db.collection('counters').doc('patients');
        try {
            return await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(counterRef);
                let nextNumber = 1;
                if (doc.exists) {
                    const lastNumber = doc.data()?.lastNumber ?? 0;
                    nextNumber = lastNumber + 1;
                    transaction.update(counterRef, { lastNumber: nextNumber });
                } else {
                    transaction.set(counterRef, { lastNumber: 1 });
                }
                return `MH${String(nextNumber).padStart(4, '0')}`;
            });
        } catch (error) {
            console.warn("Transaction failed (likely offline). Generating Offline ID.");
            const offlineId = `OFF-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            addNotification("Offline Mode: Generated temporary Hospital ID. Please update later if needed.", "warning");
            return offlineId;
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Final Validation Check
        if (age < 0) {
            addNotification('Invalid Date of Birth.', 'error');
            return;
        }
        const hasErrors = Object.values(errors).some(err => err !== '');
        if (hasErrors) {
            addNotification('Please fix the errors in the form.', 'error');
            return;
        }
        if (formData.nationality === 'Zimbabwean' && !formData.nationalId) {
             addNotification('National ID is required for Zimbabwean nationals.', 'error');
             return;
        }
        if (formData.nationality !== 'Zimbabwean' && !formData.passportNumber) {
             addNotification('Passport Number is required for foreign nationals.', 'error');
             return;
        }

        if (!userProfile) return;
        setFormStatus('loading');

        try {
            const hospitalNumber = await generateHospitalNumber();
            const fullPhoneNumber = `${formData.phoneCountryCode}${formData.phoneNumber}`;
            
            // Construct patient object, omitting undefined fields to satisfy Firestore
            const newPatient: Omit<Patient, 'id'> = {
                hospitalNumber,
                ...patientSearchFields(formData.name, formData.surname, hospitalNumber),
                name: formData.name,
                surname: formData.surname,
                nationality: formData.nationality,
                // Conditionally add keys only if they are valid for the selected nationality
                ...(formData.nationality === 'Zimbabwean' ? { nationalId: formData.nationalId } : {}),
                ...(formData.nationality !== 'Zimbabwean' ? { passportNumber: formData.passportNumber } : {}),
                dateOfBirth: formData.dateOfBirth,
                age: age,
                maritalStatus: formData.maritalStatus,
                gender: formData.gender as 'Male' | 'Female' | 'Other',
                countryOfBirth: formData.countryOfBirth,
                phoneNumber: fullPhoneNumber,
                residentialAddress: formData.residentialAddress,
                nokName: formData.nokName,
                nokSurname: formData.nokSurname,
                nokPhoneNumber: formData.nokPhoneNumber, // Assuming same country code for simplicity or add another select
                nokAddress: formData.nokAddress,
                registeredBy: userProfile.id,
                registrationDate: new Date().toISOString(),
                status: 'Discharged',
                financials: { totalBill: 0, amountPaid: 0, balance: 0 }
            };

            await db.collection('patients').add(newPatient);
            invalidateReads();
            
            addNotification(`Patient registered! ID: ${hospitalNumber}`, 'success');
            setFormStatus('success');
            setTimeout(() => {
                setFormData(initialFormState);
                setFormStatus('idle');
            }, 2000);

        } catch (error) {
            console.error("Error registering patient: ", error);
            addNotification('Failed to register patient.', 'error');
            setFormStatus('idle');
        }
    };
    
    if (authLoading || !isAuthorized) {
        return <LoadingSpinner />;
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">Patient Registration</h1>
                    <p className="text-gray-400 mt-1">Enter patient details to create a new record.</p>
                </div>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
                <Section title="Identity & Demographics" icon={<User size={24} />}>
                    <InputField label="First Name" name="name" value={formData.name} onChange={handleChange} required error={errors.name} />
                    <InputField label="Last Name" name="surname" value={formData.surname} onChange={handleChange} required error={errors.surname} />
                    <SelectField label="Nationality" name="nationality" value={formData.nationality} onChange={handleChange} options={nationalities} required />
                    
                    {formData.nationality === 'Zimbabwean' ? (
                        <InputField label="National ID" name="nationalId" value={formData.nationalId} onChange={handleChange} required placeholder="e.g. 63-123456-X-42" />
                    ) : (
                        <InputField label="Passport Number" name="passportNumber" value={formData.passportNumber} onChange={handleChange} required placeholder="Passport No." />
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <InputField label="Date of Birth" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} type="date" required error={errors.dateOfBirth} />
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Age</label>
                            <div className="modern-input flex items-center bg-gray-900 text-gray-300">
                                {age >= 0 ? `${age} Years` : '-'}
                            </div>
                        </div>
                    </div>
                    
                    <SelectField label="Gender" name="gender" value={formData.gender} onChange={handleChange} options={['Male', 'Female', 'Other']} required />
                    <SelectField label="Marital Status" name="maritalStatus" value={formData.maritalStatus} onChange={handleChange} options={['Single', 'Married', 'Divorced', 'Widowed']} required />
                    <InputField label="Country of Birth" name="countryOfBirth" value={formData.countryOfBirth} onChange={handleChange} required />
                </Section>

                <Section title="Contact Information" icon={<Globe size={24} />}>
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Phone Number <span className="text-red-500">*</span></label>
                        <div className="flex gap-2">
                            <select 
                                name="phoneCountryCode" 
                                value={formData.phoneCountryCode} 
                                onChange={handleChange} 
                                className="w-24 px-2 py-2 border border-gray-600 rounded-md bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm modern-select"
                            >
                                {countryCodes.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                            </select>
                            <input 
                                type="tel" 
                                name="phoneNumber" 
                                value={formData.phoneNumber} 
                                onChange={handleChange} 
                                required 
                                placeholder="774123456" 
                                className={`modern-input flex-1 ${errors.phoneNumber ? 'error' : ''}`} 
                            />
                        </div>
                        {errors.phoneNumber && <p className="text-red-400 text-xs mt-1">{errors.phoneNumber}</p>}
                    </div>
                    <div className="md:col-span-2">
                        <InputField label="Residential Address" name="residentialAddress" value={formData.residentialAddress} onChange={handleChange} required placeholder="House No, Street, Suburb, City" />
                    </div>
                </Section>

                <Section title="Next of Kin" icon={<Briefcase size={24} />}>
                    <InputField label="NOK First Name" name="nokName" value={formData.nokName} onChange={handleChange} required error={errors.nokName} />
                    <InputField label="NOK Last Name" name="nokSurname" value={formData.nokSurname} onChange={handleChange} required error={errors.nokSurname} />
                    <InputField label="NOK Phone Number" name="nokPhoneNumber" value={formData.nokPhoneNumber} onChange={handleChange} required error={errors.nokPhoneNumber} placeholder="77......." />
                    <div className="md:col-span-3">
                        <InputField label="NOK Address" name="nokAddress" value={formData.nokAddress} onChange={handleChange} required />
                    </div>
                </Section>

                <div className="flex justify-end pt-4">
                    <button type="submit" disabled={formStatus !== 'idle'}
                        className="inline-flex items-center justify-center py-4 px-8 border border-transparent shadow-lg text-base font-bold rounded-full text-white bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 focus:outline-none focus:ring-4 focus:ring-sky-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105">
                        {formStatus === 'loading' ? 'Processing...' : (
                            <>
                                <PlusCircle className="mr-2" size={24} /> Register Patient
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default PatientRegistration;