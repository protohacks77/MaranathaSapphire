import { usePagedQuery } from '../../services/usePagedQuery';
import LoadMore from '../../components/utils/LoadMore';
import { cachedRead } from '../../services/readCache';
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/utils/Modal';
import { ModalSkeleton } from '../../components/utils/SkeletonLoader';
import { db } from '../../services/firebase';
import firebase from 'firebase/compat/app';
import { UserProfile, UserActivity, Patient, Bill, Payment } from '../../types';
import { DollarSign, FileText, UserPlus, Clock, ExternalLink, Activity } from 'lucide-react';

interface UserActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
}

const UserActivityModal: React.FC<UserActivityModalProps> = ({ isOpen, onClose, user }) => {
    const [activities, setActivities] = useState<UserActivity[]>([]);
    const [filter, setFilter] = useState<'day' | 'week' | 'month' | 'custom'>('week');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const dateRange = useMemo(() => {
        let end = new Date();
        end.setHours(23, 59, 59, 999);
        let start = new Date();
        start.setHours(0, 0, 0, 0);

        switch (filter) {
            case 'day':
                break;
            case 'week':
                start.setDate(start.getDate() - start.getDay());
                break;
            case 'month':
                start = new Date(start.getFullYear(), start.getMonth(), 1);
                break;
            case 'custom':
                if (!customStart || !customEnd) return null;
                start = new Date(customStart);
                end = new Date(customEnd);
                end.setHours(23, 59, 59, 999);
                break;
            default:
                return null;
        }
        return { start, end };
    }, [filter, customStart, customEnd]);

    // Query directly by processedBy / registeredBy using existing indexes in firestore.indexes.json
    const billsQuery = useMemo(() => db.collection('bills').where('processedBy', '==', user.id).orderBy('date', 'desc'), [user.id]);
    const paymentsQuery = useMemo(() => db.collection('payments').where('processedBy', '==', user.id).orderBy('date', 'desc'), [user.id]);
    const registrationsQuery = useMemo(() => db.collection('patients').where('registeredBy', '==', user.id).orderBy('registrationDate', 'desc'), [user.id]);

    const billsPage = usePagedQuery<Bill>(billsQuery, `activity-bills:${user.id}`, isOpen);
    const paymentsPage = usePagedQuery<Payment>(paymentsQuery, `activity-payments:${user.id}`, isOpen);
    const registrationsPage = usePagedQuery<Patient>(registrationsQuery, `activity-patients:${user.id}`, isOpen);

    const loading = billsPage.loading || paymentsPage.loading || registrationsPage.loading;
    const pages = [billsPage, paymentsPage, registrationsPage];
    const hasMore = pages.some(page => page.hasMore);
    const loadingMore = pages.some(page => page.loadingMore);
    const indexUrl = pages.map(page => page.indexUrl).find(Boolean);
    const error = pages.map(page => page.error).find(Boolean);
    const loadMore = () => { pages.filter(page => page.hasMore).forEach(page => page.loadMore()); };
    const refresh = () => { pages.forEach(page => page.refresh()); };

    useEffect(() => {
        if (!isOpen || !user) {
            setActivities([]);
            return;
        }

        const processActivities = async () => {
            const allActivities: UserActivity[] = [];

            try {
                // Bills
                billsPage.records.forEach(bill => {
                    allActivities.push({
                        id: `bill-${bill.id}`,
                        originalId: bill.id!,
                        type: 'Billing',
                        date: new Date(bill.date),
                        patientId: bill.patientId,
                        patientName: bill.patientName || 'Patient',
                        details: `Processed bill of $${(bill.totalBill || 0).toFixed(2)}`,
                        link: `/bills/${bill.id}`,
                    });
                });

                // Registrations
                registrationsPage.records.forEach(patient => {
                    allActivities.push({
                        id: `reg-${patient.id}`,
                        originalId: patient.id!,
                        type: 'Registration',
                        date: new Date(patient.registrationDate),
                        patientId: patient.id!,
                        patientName: `${patient.name} ${patient.surname}`,
                        details: 'Registered new patient',
                        link: `/patients/${patient.id}`,
                    });
                });

                // Payments
                const paymentActivities = paymentsPage.records.map(payment => ({
                    id: `payment-${payment.id}`,
                    originalId: payment.id!,
                    type: 'Payment' as const,
                    date: new Date(payment.date),
                    patientId: payment.patientId,
                    patientName: 'Loading...',
                    details: `Recorded payment of $${(payment.amount || 0).toFixed(2)}`,
                    link: `/patients/${payment.patientId}`,
                }));

                const patientIdsForPayments = [...new Set(paymentActivities.map(p => p.patientId))].filter(Boolean);
                if (patientIdsForPayments.length > 0) {
                    const patientsSnapshot = await cachedRead(`activity-patient-names:${patientIdsForPayments.join(',')}`, async () => {
                        const docs = await Promise.all(patientIdsForPayments.map(id => cachedRead(`patient-name:${id}`, () => db.collection('patients').doc(id).get(), 300_000)));
                        return { forEach: (visit: (doc: firebase.firestore.DocumentSnapshot) => void) => docs.filter(doc => doc.exists).forEach(visit) };
                    });
                    const patientNameMap = new Map<string, string>();
                    patientsSnapshot.forEach(doc => {
                        const p = doc.data() as Patient;
                        patientNameMap.set(doc.id, `${p.name} ${p.surname}`);
                    });
                    paymentActivities.forEach(act => {
                        act.patientName = patientNameMap.get(act.patientId) || 'Unknown Patient';
                    });
                }
                allActivities.push(...paymentActivities);

                // Client-side date range filtering
                let filtered = allActivities;
                if (dateRange) {
                    filtered = allActivities.filter(activity => {
                        return activity.date >= dateRange.start && activity.date <= dateRange.end;
                    });
                }
                filtered.sort((a, b) => b.date.getTime() - a.date.getTime());
                setActivities(filtered);

            } catch (err) {
                console.error("Error processing user activity:", err);
            }
        };

        processActivities();
    }, [isOpen, user.id, dateRange, billsPage.records, paymentsPage.records, registrationsPage.records]);

    const ActivityBadgeIcon: React.FC<{ type: UserActivity['type'] }> = ({ type }) => {
        switch (type) {
            case 'Registration':
                return (
                    <div className="w-8 h-8 rounded-full bg-purple-900/50 border border-purple-500/50 text-purple-300 flex items-center justify-center shrink-0 shadow-sm">
                        <UserPlus size={16} />
                    </div>
                );
            case 'Billing':
                return (
                    <div className="w-8 h-8 rounded-full bg-blue-900/50 border border-blue-500/50 text-blue-300 flex items-center justify-center shrink-0 shadow-sm">
                        <FileText size={16} />
                    </div>
                );
            case 'Payment':
                return (
                    <div className="w-8 h-8 rounded-full bg-green-900/50 border border-green-500/50 text-green-300 flex items-center justify-center shrink-0 shadow-sm">
                        <DollarSign size={16} />
                    </div>
                );
            default:
                return (
                    <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-600 text-gray-300 flex items-center justify-center shrink-0">
                        <Activity size={16} />
                    </div>
                );
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Activity Log: ${user.name} ${user.surname}`} size="lg">
            <div className="space-y-6">
                {/* User Header Summary */}
                <div className="flex items-center justify-between p-4 bg-gray-800/60 rounded-xl border border-gray-700/60">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-sky-600/30 border border-sky-500/50 flex items-center justify-center font-bold text-sky-400">
                            {user.name.charAt(0)}{user.surname.charAt(0)}
                        </div>
                        <div>
                            <p className="font-semibold text-white">{user.name} {user.surname}</p>
                            <p className="text-xs text-gray-400">{user.role} • {user.department}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-gray-400">Activities Recorded</p>
                        <p className="text-xl font-bold text-sky-400">{activities.length}</p>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex bg-gray-800/80 p-1 rounded-lg border border-gray-700">
                        {(['day', 'week', 'month', 'custom'] as const).map(fKey => (
                            <button
                                key={fKey}
                                onClick={() => setFilter(fKey)}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all capitalize ${
                                    filter === fKey
                                        ? 'bg-sky-600 text-white shadow-md'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                                }`}
                            >
                                {fKey === 'day' ? 'Today' : fKey === 'week' ? 'This Week' : fKey === 'month' ? 'This Month' : 'Custom'}
                            </button>
                        ))}
                    </div>
                </div>

                {filter === 'custom' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-gray-800/40 rounded-lg border border-gray-700">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Start Date</label>
                            <input
                                type="date"
                                value={customStart}
                                onChange={e => setCustomStart(e.target.value)}
                                className="w-full modern-input text-xs"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">End Date</label>
                            <input
                                type="date"
                                value={customEnd}
                                onChange={e => setCustomEnd(e.target.value)}
                                className="w-full modern-input text-xs"
                            />
                        </div>
                    </div>
                )}

                {/* Activity Timeline */}
                <div className="max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                    {loading ? (
                        <ModalSkeleton items={4} />
                    ) : activities.length > 0 ? (
                        <div className="relative border-l-2 border-gray-700/80 ml-4 space-y-4 py-2">
                            {activities.map(activity => (
                                <div key={activity.id} className="relative pl-6 group">
                                    {/* Timeline Icon Badge */}
                                    <div className="absolute -left-4 top-0.5">
                                        <ActivityBadgeIcon type={activity.type} />
                                    </div>

                                    {/* Activity Card */}
                                    <div className="bg-gray-800/40 hover:bg-gray-800/80 border border-gray-700/50 hover:border-gray-600 rounded-xl p-3.5 transition-all">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                                activity.type === 'Registration' ? 'bg-purple-900/30 text-purple-400 border border-purple-800/50' :
                                                activity.type === 'Billing' ? 'bg-blue-900/30 text-blue-400 border border-blue-800/50' :
                                                'bg-green-900/30 text-green-400 border border-green-800/50'
                                            }`}>
                                                {activity.type}
                                            </span>
                                            <span className="text-xs text-gray-400 flex items-center gap-1 font-mono">
                                                <Clock size={12} className="text-gray-500" />
                                                {activity.date.toLocaleString()}
                                            </span>
                                        </div>

                                        <p className="text-sm text-gray-200 mt-2">
                                            {activity.details} for patient{' '}
                                            <Link
                                                to={activity.link}
                                                onClick={onClose}
                                                className="font-semibold text-sky-400 hover:text-sky-300 hover:underline inline-flex items-center gap-1"
                                            >
                                                {activity.patientName} <ExternalLink size={12} />
                                            </Link>
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 bg-gray-800/20 rounded-xl border border-gray-800">
                            <Activity className="mx-auto h-10 w-10 text-gray-600 mb-2" />
                            <p className="text-gray-400 font-medium">No activity recorded for this period.</p>
                            <p className="text-xs text-gray-500 mt-1">Try selecting a different date range.</p>
                        </div>
                    )}
                </div>

                <LoadMore hasMore={hasMore} loading={loadingMore} error={error} indexUrl={indexUrl} onLoad={loadMore} onRetry={refresh} />
            </div>
        </Modal>
    );
};

export default UserActivityModal;
