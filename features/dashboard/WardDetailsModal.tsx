
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../services/firebase';
import { Ward, Patient, AdmissionRecord } from '../../types';
import Modal from '../../components/utils/Modal';
import { recordDate, formatRecordDate, formatRecordTime } from '../patients/recordTimestamp';
import LoadingSpinner from '../../components/utils/LoadingSpinner';
import { Bed, Clock, User, Calendar, CheckCircle, AlertTriangle } from 'lucide-react';

interface WardDetailsModalProps {
  ward: Ward;
  onClose: () => void;
}

interface OccupiedBedInfo {
  patient: Patient;
  admissionDate: Date | null;
}

const WardDetailsModal: React.FC<WardDetailsModalProps> = ({ ward, onClose }) => {
  const [beds, setBeds] = useState<Map<number, OccupiedBedInfo>>(new Map());
  const [unassignedPatients, setUnassignedPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [occupiedCount, setOccupiedCount] = useState(0);

  useEffect(() => {
    if (!ward) return;

    const fetchBedDetails = async () => {
      setLoading(true);
      try {
        const patientsSnapshot = await db.collection('patients')
          .where('currentWardId', '==', ward.id)
          .where('status', 'in', ['Admitted', 'PendingDischarge'])
          .get();

        const bedMap = new Map<number, OccupiedBedInfo>();
        const unassigned: Patient[] = [];
        let count = 0;
        
        for (const doc of patientsSnapshot.docs) {
          const patient = { id: doc.id, ...doc.data() } as Patient;
          
          // Count every patient in this ward regardless of bed status
          count++;

          if (patient.currentBedNumber) {
            // Ensure bedNumber is treated as a number
            const bedNum = Number(patient.currentBedNumber);
            
            const admissionDate = recordDate((patient as Patient & { currentAdmissionDate?: unknown }).currentAdmissionDate);

            bedMap.set(bedNum, { patient, admissionDate });
          } else {
            // Patient is in the ward but has no bed number (Ghost patient)
            unassigned.push(patient);
          }
        }
        setBeds(bedMap);
        setUnassignedPatients(unassigned);
        setOccupiedCount(count);
      } catch (error) {
        console.error("Error fetching bed details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBedDetails();
  }, [ward]);
  
  if (!ward) return null;

  const freeBeds = Math.max(0, ward.totalBeds - occupiedCount);

  return (
    <Modal isOpen={true} onClose={onClose} title={`${ward.name} - Overview`} size="xl">
      {loading ? (
        <div className="h-64 flex items-center justify-center">
            <LoadingSpinner />
        </div>
      ) : (
        <div>
            {/* Summary Header */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700 text-center">
                    <p className="text-xs text-gray-400 uppercase">Total Beds</p>
                    <p className="text-2xl font-bold text-white">{ward.totalBeds}</p>
                </div>
                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700 text-center">
                    <p className="text-xs text-gray-400 uppercase">Occupied</p>
                    <p className="text-2xl font-bold text-sky-400">{occupiedCount}</p>
                </div>
                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700 text-center">
                    <p className="text-xs text-gray-400 uppercase">Available</p>
                    <p className="text-2xl font-bold text-emerald-400">{freeBeds}</p>
                </div>
            </div>

            {/* Warning for Unassigned Patients (Ghost Patients) */}
            {unassignedPatients.length > 0 && (
                <div className="mb-6 bg-red-900/20 border border-red-800 rounded-lg p-4">
                    <h4 className="text-red-400 font-bold flex items-center gap-2 mb-2">
                        <AlertTriangle size={18} />
                        Patients in Ward without Bed Assignment
                    </h4>
                    <p className="text-sm text-gray-300 mb-3">
                        The following patients are listed in this ward but do not have a specific bed number assigned. 
                        Click a patient to update their admission details.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {unassignedPatients.map(p => (
                            <Link 
                                key={p.id}
                                to={`/patients/${p.id}`}
                                className="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 border border-red-700 rounded-md text-sm text-red-200 flex items-center gap-2 transition-colors"
                                onClick={onClose}
                            >
                                <User size={14} />
                                {p.name} {p.surname}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <div className="max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: ward.totalBeds }, (_, i) => i + 1).map((bedNumber) => {
                    const bedInfo = beds.get(bedNumber);
                    const isOccupied = !!bedInfo;

                    return (
                    <div 
                        key={bedNumber} 
                        className={`relative flex flex-col p-4 rounded-lg border-l-4 transition-all ${
                            isOccupied 
                            ? 'bg-gray-800 border-sky-600 border-y border-r border-gray-700' 
                            : 'bg-gray-900/30 border-emerald-500/50 border-y border-r border-gray-800 hover:bg-gray-800/50'
                        }`}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Bed</span>
                                <span className="text-xl font-bold text-white">{bedNumber}</span>
                            </div>
                            {isOccupied ? (
                                <Bed size={18} className="text-sky-400" />
                            ) : (
                                <CheckCircle size={18} className="text-emerald-500/50" />
                            )}
                        </div>

                        {isOccupied ? (
                        <div className="flex-grow flex flex-col justify-between">
                            <div>
                                <p className="text-xs text-gray-400 mb-1">Patient</p>
                                <Link 
                                    to={`/patients/${bedInfo.patient.id}`} 
                                    className="text-sm font-semibold text-sky-400 hover:text-sky-300 hover:underline block mb-2 truncate" 
                                    onClick={onClose}
                                    title={`${bedInfo.patient.name} ${bedInfo.patient.surname}`}
                                >
                                {bedInfo.patient.name} {bedInfo.patient.surname}
                                </Link>
                            </div>
                            <div className="pt-3 border-t border-gray-700 mt-2">
                                <div className="flex items-center justify-between gap-2 text-xs text-gray-400 tabular-nums">
                                    <span className="inline-flex items-center gap-2">
                                        <Calendar size={12} className="shrink-0" />
                                        <span>{formatRecordDate(bedInfo.admissionDate)}</span>
                                    </span>
                                    <span className="shrink-0 text-gray-500">{formatRecordTime(bedInfo.admissionDate)}</span>
                                </div>
                            </div>
                        </div>
                        ) : (
                        <div className="flex-grow flex items-center justify-center">
                            <span className="px-3 py-1 rounded-full bg-emerald-900/20 text-emerald-400 text-xs font-medium border border-emerald-900/30">
                                Not Occupied
                            </span>
                        </div>
                        )}
                    </div>
                    );
                })}
                </div>
            </div>
        </div>
      )}
    </Modal>
  );
};

export default WardDetailsModal;
