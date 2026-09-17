import { usePagedQuery } from '../../services/usePagedQuery';
import LoadMore from '../../components/utils/LoadMore';
import { invalidateReads } from '../../services/readCache';

import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../services/firebase';
import { Patient } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import PageSkeleton from '../../components/utils/SkeletonLoader';
import Modal from '../../components/utils/Modal';
import { CheckCircle, XCircle, DollarSign, CreditCard, Receipt, Bed, AlertTriangle, History, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import firebase from 'firebase/compat/app';

const DischargeApproval: React.FC = () => {
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [modalAction, setModalAction] = useState<'approve' | 'reject' | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const { addNotification } = useNotification();
    const { userProfile } = useAuth();

    const pendingQuery = useMemo(() => db.collection('patients').where('status', '==', 'PendingDischarge').orderBy('surname'), []);
    const historyQuery = useMemo(() => db.collection('patients').where('status', '==', 'Discharged').orderBy('registrationDate', 'desc'), []);
    const pending = usePagedQuery<Patient>(pendingQuery, 'discharge:pending');
    const history = usePagedQuery<Patient>(historyQuery, 'discharge:history');
    const patients = pending.records;
    const historyPatients = history.records;
    const loading = pending.loading || history.loading;
    const loadAllData = () => { invalidateReads(); pending.refresh(); history.refresh(); };

    const openModal = (patient: Patient, action: 'approve' | 'reject') => {
        setRejectionReason(''); // Reset reason
        setSelectedPatient(patient);
        setModalAction(action);
    };

    const closeModal = () => {
        setSelectedPatient(null);
        setModalAction(null);
    };

    const handleConfirm = async () => {
        if (!selectedPatient || !modalAction || !userProfile) return;

        if (modalAction === 'reject' && !rejectionReason.trim()) {
            addNotification('Please provide a reason for rejection.', 'warning');
            return;
        }

        const newStatus = modalAction === 'approve' ? 'Discharged' : 'Admitted';
        try {
            const patientRef = db.collection('patients').doc(selectedPatient.id!);
            const batch = db.batch();

            const updateData: any = {
                status: newStatus,
                dischargeRequesterId: firebase.firestore.FieldValue.delete()
            };

            if (modalAction === 'approve') {
                // Clear ward info
                updateData.currentWardId = firebase.firestore.FieldValue.delete();
                updateData.currentWardName = firebase.firestore.FieldValue.delete();
                updateData.currentAdmissionDate = firebase.firestore.FieldValue.delete();
                updateData.currentBedNumber = firebase.firestore.FieldValue.delete();
                
                // Add explicit discharge timestamp for history sorting
                updateData.lastDischargeDate = firebase.firestore.FieldValue.serverTimestamp();

                // Find the latest admission record and update it with discharge info
                const admissionHistoryRef = patientRef.collection('admissionHistory');
                const query = admissionHistoryRef.orderBy('admissionDate', 'desc').limit(1);
                const snapshot = await query.get();

                if (!snapshot.empty) {
                    const latestAdmissionDoc = snapshot.docs[0];
                    if (!latestAdmissionDoc.data().dischargeDate) {
                        batch.update(latestAdmissionDoc.ref, {
                            dischargeDate: firebase.firestore.FieldValue.serverTimestamp(),
                            dischargedById: userProfile.id,
                            dischargedByName: `${userProfile.name} ${userProfile.surname}`
                        });
                    }
                }
            }

            if (modalAction === 'reject' && selectedPatient.dischargeRequesterId) {
                const notificationRef = db.collection('notifications').doc();
                batch.set(notificationRef, {
                    recipientId: selectedPatient.dischargeRequesterId,
                    senderId: userProfile.id,
                    senderName: `${userProfile.name} ${userProfile.surname}`,
                    title: 'Discharge Request Disapproved',
                    message: `The discharge request for patient ${selectedPatient.name} ${selectedPatient.surname} (${selectedPatient.hospitalNumber}) was disapproved. Reason: ${rejectionReason}`,
                    type: 'system_alert',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    read: false,
                });
            }
            
            batch.update(patientRef, updateData);
            await batch.commit();

            const actionText = modalAction === 'approve' && selectedPatient.financials.balance > 0 
                ? 'Discharged on Credit' 
                : newStatus;

            addNotification(`Patient status updated: ${actionText}.`, 'success');
            loadAllData(); // Refresh both lists
            closeModal();
        } catch (error) {
            console.error(`Error updating patient status:`, error);
            addNotification('Failed to update patient status.', 'error');
        }
    };

    if (loading) return <PageSkeleton type="cards" />;

    // Helper for Zimbabwe Date Time
    const formatDateTime = (dateVal: any) => {
        if (!dateVal) return 'Unknown';
        const date = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
        return date.toLocaleString('en-GB', { 
            timeZone: 'Africa/Harare', 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Discharge Approval</h1>
                <p className="text-gray-400">Review pending discharge requests and authorize release.</p>
            </div>

            {/* Pending Approvals Grid */}
            {patients.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {patients.map(p => {
                        const hasBalance = p.financials.balance > 0;
                        return (
                            <div key={p.id} className={`bg-[#161B22] border rounded-xl p-6 shadow-md flex flex-col justify-between h-full transition-all ${hasBalance ? 'border-orange-900/50 hover:border-orange-500/50' : 'border-gray-700 hover:border-sky-500/50'}`}>
                                <div>
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="text-xl font-bold text-white truncate">{p.name} {p.surname}</h3>
                                            <p className="text-sm text-gray-400 font-mono">Hosp. No: {p.hospitalNumber}</p>
                                        </div>
                                    </div>

                                    <div className="bg-gray-800/50 p-4 rounded-lg mb-6 border border-gray-700/50">
                                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Outstanding Balance</p>
                                        <h2 className={`text-2xl font-extrabold ${hasBalance ? 'text-red-400' : 'text-green-400'}`}>
                                            ${p.financials.balance.toFixed(2)}
                                        </h2>
                                        {hasBalance && (
                                            <div className="flex items-center gap-1.5 mt-2 text-orange-400 text-xs font-medium">
                                                <AlertTriangle size={12} />
                                                <span>Requires Credit Approval</span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="space-y-3 mb-6 text-sm text-gray-300">
                                        <div className="flex items-center justify-between border-b border-gray-700/50 pb-2">
                                            <div className="flex items-center gap-2 text-gray-400"><Receipt size={16} /> Total Bill</div>
                                            <span className="font-medium text-white">${p.financials.totalBill.toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center justify-between border-b border-gray-700/50 pb-2">
                                            <div className="flex items-center gap-2 text-gray-400"><CreditCard size={16} /> Amount Paid</div>
                                            <span className="font-medium text-white">${p.financials.amountPaid.toFixed(2)}</span>
                                        </div>
                                        {p.currentWardName && (
                                            <div className="flex items-center justify-between pt-1">
                                                <div className="flex items-center gap-2 text-gray-400"><Bed size={16} /> Location</div>
                                                <span className="font-medium text-sky-400">{p.currentWardName}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 mt-auto">
                                    <button 
                                        onClick={() => openModal(p, 'reject')}
                                        className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-red-600/10 hover:bg-red-600/20 border border-red-600/50 text-red-400 rounded-lg transition-colors"
                                    >
                                        <XCircle size={18} /> Reject
                                    </button>
                                    <button
                                        onClick={() => openModal(p, 'approve')}
                                        className={`flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors shadow-sm ${
                                            hasBalance 
                                            ? 'bg-orange-600 hover:bg-orange-700' 
                                            : 'bg-green-600 hover:bg-green-500'
                                        }`}
                                    >
                                        {hasBalance ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
                                        {hasBalance ? 'Approve (Credit)' : 'Approve'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center p-12 bg-[#161B22] border border-gray-700 rounded-lg">
                    <CheckCircle className="mx-auto h-12 w-12 text-gray-600 mb-4" />
                    <p className="text-gray-400 text-lg">No patients are currently pending discharge approval.</p>
                </div>
            )}

            <LoadMore hasMore={pending.hasMore} loading={pending.loadingMore} error={pending.error} indexUrl={pending.indexUrl} onLoad={pending.loadMore} onRetry={pending.refresh} />
            {/* Discharge History Table */}
            <div className="mt-12">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <History size={24} className="text-sky-400" />
                    Discharge History
                </h2>
                <div className="bg-[#161B22] border border-gray-700 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 border-b border-gray-700">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Patient Name</th>
                                    <th className="px-6 py-4 font-medium">ID / Passport</th>
                                    <th className="px-6 py-4 font-medium">Time Discharged</th>
                                    <th className="px-6 py-4 font-medium text-right">Total Bill</th>
                                    <th className="px-6 py-4 font-medium text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {historyPatients.length > 0 ? (
                                    historyPatients.map((p) => {
                                        const isCredit = p.financials.balance > 0;
                                        // Removed admission date formatting as it's no longer used in the table
                                        const dischargedDate = formatDateTime((p as any).lastDischargeDate);

                                        return (
                                            <tr key={p.id} className="hover:bg-gray-800/30 transition-colors">
                                                <td className="px-6 py-4 font-medium text-white">
                                                    {p.name} {p.surname}
                                                    <div className="text-xs text-gray-500 font-mono mt-0.5">{p.hospitalNumber}</div>
                                                </td>
                                                <td className="px-6 py-4 text-gray-300">
                                                    {p.nationalId || p.passportNumber || <span className="text-gray-600 italic">N/A</span>}
                                                </td>
                                                <td className="px-6 py-4 text-gray-400">
                                                    {dischargedDate}
                                                </td>
                                                <td className="px-6 py-4 text-right font-medium text-gray-200">
                                                    ${p.financials.totalBill.toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                                                        isCredit 
                                                        ? 'bg-red-900/20 text-red-400 border-red-800' 
                                                        : 'bg-green-900/20 text-green-400 border-green-800'
                                                    }`}>
                                                        {isCredit ? 'Discharged with Credit' : 'Fully Paid'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                            No discharge history found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <LoadMore hasMore={history.hasMore} loading={history.loadingMore} error={history.error} indexUrl={history.indexUrl} onLoad={history.loadMore} onRetry={history.refresh} />
            {selectedPatient && (
                <Modal isOpen={!!modalAction} onClose={closeModal} title={`Confirm ${modalAction === 'approve' ? 'Approval' : 'Rejection'}`}>
                    <p className="text-gray-300 mb-4">
                        Are you sure you want to {modalAction} the discharge for <span className="font-bold text-white">{selectedPatient.name} {selectedPatient.surname}</span>?
                    </p>
                    
                    {modalAction === 'approve' && selectedPatient.financials.balance > 0 && (
                        <div className="mb-4 p-4 bg-orange-900/20 border border-orange-700/50 rounded-lg flex gap-3">
                            <AlertTriangle className="text-orange-500 flex-shrink-0" size={24} />
                            <div>
                                <h4 className="text-orange-400 font-bold text-sm uppercase mb-1">Pending Balance Warning</h4>
                                <p className="text-sm text-gray-300">
                                    This patient has an outstanding balance of <span className="font-bold text-white">${selectedPatient.financials.balance.toFixed(2)}</span>. 
                                    Approving this will discharge them on <strong>Credit</strong>.
                                </p>
                            </div>
                        </div>
                    )}

                     {modalAction === 'reject' && (
                        <div className="mt-4">
                            <label htmlFor="rejectionReason" className="block text-sm font-medium text-gray-300">Reason for Rejection (Required)</label>
                            <textarea
                                id="rejectionReason"
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                rows={3}
                                className="mt-1 block w-full modern-input"
                                placeholder="e.g., Awaiting final lab results..."
                            />
                        </div>
                    )}
                    <div className="mt-6 flex justify-end space-x-4">
                        <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
                        <button onClick={handleConfirm} className={`px-4 py-2 text-sm font-medium text-white rounded-md ${modalAction === 'approve' ? (selectedPatient.financials.balance > 0 ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700') : 'bg-red-600 hover:bg-red-700'}`}>
                            Confirm {modalAction === 'approve' ? (selectedPatient.financials.balance > 0 ? 'Credit Discharge' : 'Approval') : 'Rejection'}
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default DischargeApproval;
