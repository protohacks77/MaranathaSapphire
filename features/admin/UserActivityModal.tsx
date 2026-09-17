import { usePagedQuery } from '../../services/usePagedQuery';
import LoadMore from '../../components/utils/LoadMore';
import { cachedRead } from '../../services/readCache';
import { dateQuery } from '../../services/lowReadQueries';
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/utils/Modal';
import LoadingSpinner from '../../components/utils/LoadingSpinner';
import { db } from '../../services/firebase';
import firebase from 'firebase/compat/app';
import { UserProfile, UserActivity, Patient, Bill, Payment } from '../../types';
import { DollarSign, FileText, UserPlus } from 'lucide-react';

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
        // FIX: Changed 'end' from const to let to allow reassignment in the 'custom' case.
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

    const queryKey = `${user.id}:${dateRange?.start.toISOString()}:${dateRange?.end.toISOString()}`;
    const billsQuery = useMemo(() => dateQuery('bills', 'date', dateRange).where('processedBy', '==', user.id).orderBy('date', 'desc'), [user.id, dateRange]);
    const paymentsQuery = useMemo(() => dateQuery('payments', 'date', dateRange).where('processedBy', '==', user.id).orderBy('date', 'desc'), [user.id, dateRange]);
    const registrationsQuery = useMemo(() => dateQuery('patients', 'registrationDate', dateRange).where('registeredBy', '==', user.id).orderBy('registrationDate', 'desc'), [user.id, dateRange]);
    const billsPage = usePagedQuery<Bill>(billsQuery, `activity-bills:${queryKey}`, isOpen && Boolean(dateRange));
    const paymentsPage = usePagedQuery<Payment>(paymentsQuery, `activity-payments:${queryKey}`, isOpen && Boolean(dateRange));
    const registrationsPage = usePagedQuery<Patient>(registrationsQuery, `activity-patients:${queryKey}`, isOpen && Boolean(dateRange));
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

        const fetchActivities = async () => {

            const allActivities: UserActivity[] = [];

            try {
                const snapshots = [billsPage.records, paymentsPage.records, registrationsPage.records].map(records => ({ docs: records.map(record => ({ id: record.id!, data: () => record })), forEach: (visit: (doc: any) => void) => records.forEach(record => visit({id: record.id!, data: () => record})) }));
                const [billsSnap, paymentsSnap, regSnap] = snapshots;

                billsSnap.forEach(doc => {
                    const bill = { id: doc.id, ...doc.data() } as Bill;
                    allActivities.push({
                        id: `bill-${bill.id}`,
                        originalId: bill.id!,
                        type: 'Billing',
                        date: new Date(bill.date),
                        patientId: bill.patientId,
                        patientName: bill.patientName,
                        details: `Processed bill of $${bill.totalBill.toFixed(2)}`,
                        link: `/bills/${bill.id}`,
                    });
                });

                regSnap.forEach(doc => {
                    const patient = { id: doc.id, ...doc.data() } as Patient;
                    allActivities.push({
                        id: `reg-${patient.id}`,
                        originalId: patient.id!,
                        type: 'Registration',
                        date: new Date(patient.registrationDate),
                        patientId: patient.id!,
                        patientName: `${patient.name} ${patient.surname}`,
                        details: 'Registered a new patient',
                        link: `/patients/${patient.id}`,
                    });
                });

                const paymentActivities = paymentsSnap.docs.map(doc => {
                    const payment = { id: doc.id, ...doc.data() } as Payment;
                    return {
                        id: `payment-${payment.id}`,
                        originalId: payment.id!,
                        type: 'Payment' as const,
                        date: new Date(payment.date),
                        patientId: payment.patientId,
                        patientName: 'Loading...', // Placeholder
                        details: `Recorded a payment of $${payment.amount.toFixed(2)}`,
                        link: `/patients/${payment.patientId}`,
                    };
                });
                
                const patientIdsForPayments = [...new Set(paymentActivities.map(p => p.patientId))];
                if (patientIdsForPayments.length > 0) {
                     const patientsSnapshot = await cachedRead(`activity-patient-names:${patientIdsForPayments.join(',')}`, async () => { const docs = await Promise.all(patientIdsForPayments.map(id => cachedRead(`patient-name:${id}`, () => db.collection('patients').doc(id).get(), 300_000))); return { forEach: (visit: (doc: firebase.firestore.DocumentSnapshot) => void) => docs.filter(doc => doc.exists).forEach(visit) }; });
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
                
                // Filter by date range on the client-side
                if (dateRange) {
                    const filtered = allActivities.filter(activity => {
                        const activityDate = activity.date;
                        return activityDate >= dateRange.start && activityDate <= dateRange.end;
                    });
                    filtered.sort((a, b) => b.date.getTime() - a.date.getTime());
                    setActivities(filtered);
                } else {
                    setActivities([]);
                }
                

            } catch (error) {
                console.error("Error fetching user activity:", error);
            } finally {

            }
        };
        
        if (dateRange) {
            fetchActivities();
        } else {
            setActivities([]);
        }

    }, [isOpen, user.id, dateRange, billsPage.records, paymentsPage.records, registrationsPage.records]);

    const ActivityIcon: React.FC<{ type: UserActivity['type'] }> = ({ type }) => {
        const iconProps = { size: 16, className: "text-white" };
        const baseClass = "activity-icon";
        switch (type) {
            case 'Registration': return <div className={`${baseClass} bg-purple-600`}><UserPlus {...iconProps} /></div>;
            case 'Billing': return <div className={`${baseClass} bg-blue-600`}><FileText {...iconProps} /></div>;
            case 'Payment': return <div className={`${baseClass} bg-green-600`}><DollarSign {...iconProps} /></div>;
            default: return null;
        }
    };

    const FilterButton: React.FC<{ value: typeof filter, children: React.ReactNode }> = ({ value, children }) => (
        <button onClick={() => setFilter(value)} className={`activity-filter-buttons button ${filter === value ? 'active' : ''}`}>{children}</button>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Activity Log: ${user.name} ${user.surname}`} size="lg">
            <div className="activity-filter-buttons">
                <button onClick={() => setFilter('day')} className={filter === 'day' ? 'active' : ''}>Today</button>
                <button onClick={() => setFilter('week')} className={filter === 'week' ? 'active' : ''}>This Week</button>
                <button onClick={() => setFilter('month')} className={filter === 'month' ? 'active' : ''}>This Month</button>
                <button onClick={() => setFilter('custom')} className={filter === 'custom' ? 'active' : ''}>Custom</button>
            </div>

            {filter === 'custom' && (
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-full modern-input" />
                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full modern-input" />
                </div>
            )}

            <div className="activity-timeline">
                {loading ? <LoadingSpinner /> : (
                    activities.length > 0 ? activities.map(activity => (
                        <div key={activity.id} className="activity-item">
                            <ActivityIcon type={activity.type} />
                            <p className="activity-date">{activity.date.toLocaleString()}</p>
                            <p className="activity-details">
                                {activity.details} for patient <Link to={activity.link} onClick={onClose}>{activity.patientName}</Link>.
                            </p>
                        </div>
                    )) : <p className="text-gray-500 text-center py-8">No activity recorded for this period.</p>
                )}
            </div>
            <LoadMore hasMore={hasMore} loading={loadingMore} error={error} indexUrl={indexUrl} onLoad={loadMore} onRetry={refresh} />
        </Modal>
    );
};

export default UserActivityModal;
