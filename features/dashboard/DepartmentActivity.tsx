import { useOfflineView } from '../../services/useOfflineView';
import { cachedRead } from '../../services/readCache';

import React, { useEffect, useState } from 'react';
import { db } from '../../services/firebase';
import { Bill, Payment, UserProfile, Patient } from '../../types';
import LoadingSpinner from '../../components/utils/LoadingSpinner';
// FIX: Updated react-router-dom import for v5 compatibility.
import { Link } from 'react-router-dom';
import { DollarSign, FileText, Clock, UserPlus, ArrowRight } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import firebase from 'firebase/compat/app';

interface Activity {
  id: string;
  type: 'Bill' | 'Payment' | 'Registration';
  date: Date;
  patientName: string;
  patientId: string;
  processedByName: string;
  amount?: number;
  originalId: string;
}

const DepartmentActivity: React.FC = () => {
    const { data: activities = [], loading } = useOfflineView<Activity[]>('department-activity', async () => {
                // 1. Fetch Accounts department users to map IDs to names
                const usersSnapshot = await cachedRead('activity:accounts-staff', () => db.collection('users').where('department', '==', 'Accounts').get(), 300000);
                const usersMap = new Map<string, string>();
                usersSnapshot.docs.forEach(doc => {
                    const user = doc.data() as UserProfile;
                    usersMap.set(doc.id, `${user.name} ${user.surname}`);
                });

                // 2. Fetch recent bills
                const billsSnapshot = await cachedRead('activity:latest-bills', () => db.collection('bills').orderBy('date', 'desc').limit(10).get(), 60000);
                const billActivities: Activity[] = billsSnapshot.docs.map(doc => {
                    const bill = { id: doc.id, ...doc.data() } as Bill;
                    return {
                        id: `bill-${bill.id}`,
                        type: 'Bill',
                        date: new Date(bill.date),
                        patientName: bill.patientName,
                        patientId: bill.patientId,
                        processedByName: usersMap.get(bill.processedBy) || 'Unknown Clerk',
                        amount: bill.totalBill,
                        originalId: bill.id!,
                    };
                });
                
                // 3. Fetch recent payments
                const paymentsSnapshot = await cachedRead('activity:latest-payments', () => db.collection('payments').orderBy('date', 'desc').limit(10).get(), 60000);
                const paymentActivities: Activity[] = paymentsSnapshot.docs.map(doc => {
                    const payment = { id: doc.id, ...doc.data() } as Payment;
                    return {
                        id: `payment-${payment.id}`,
                        type: 'Payment',
                        date: new Date(payment.date),
                        patientName: '...', // Placeholder, will be fetched next
                        patientId: payment.patientId,
                        processedByName: payment.processedByName,
                        amount: payment.amount,
                        originalId: payment.id!,
                    };
                });
                
                // 4. Fetch recent patient registrations
                const patientsSnapshot = await cachedRead('activity:latest-registrations', () => db.collection('patients').orderBy('registrationDate', 'desc').limit(10).get(), 60000);
                const registrationActivities: Activity[] = patientsSnapshot.docs.map(doc => {
                    const patient = { id: doc.id, ...doc.data() } as Patient;
                    return {
                        id: `reg-${patient.id}`,
                        type: 'Registration',
                        date: new Date(patient.registrationDate),
                        patientName: `${patient.name} ${patient.surname}`,
                        patientId: patient.id!,
                        processedByName: usersMap.get(patient.registeredBy) || 'Unknown Clerk',
                        originalId: patient.id!,
                    };
                });

                // 5. Combine and sort all activities
                let combined = [...billActivities, ...paymentActivities, ...registrationActivities];
                combined.sort((a, b) => b.date.getTime() - a.date.getTime());
                combined = combined.slice(0, 15); // Limit to latest 15 overall

                // 6. Post-process to fetch patient names for payments
                const patientIdsForPayments = paymentActivities.map(p => p.patientId).filter((id, index, self) => self.indexOf(id) === index);
                if(patientIdsForPayments.length > 0) {
                    const patientDocs = await Promise.all(patientIdsForPayments.map(id => cachedRead(`patient-name:${id}`, () => db.collection('patients').doc(id).get(), 300_000)));
                    const patientNamesMap = new Map<string, string>();
                    patientDocs.forEach(doc => {
                        if (doc.exists) {
                            const p = doc.data() as Patient;
                            patientNamesMap.set(doc.id, `${p.name} ${p.surname}`);
                        }
                    });
                    combined.forEach(activity => {
                        if (activity.type === 'Payment' && patientNamesMap.has(activity.patientId)) {
                            activity.patientName = patientNamesMap.get(activity.patientId)!;
                        }
                    });
                }
                
                return combined.slice(0, 10);
    });

    const ActivityIcon = ({ type }: { type: Activity['type']}) => {
        const size = 16;
        switch (type) {
            case 'Bill': return <FileText size={size} className="text-blue-400" />;
            case 'Payment': return <DollarSign size={size} className="text-green-400" />;
            case 'Registration': return <UserPlus size={size} className="text-purple-400" />;
            default: return null;
        }
    }
    
    if (loading) return <LoadingSpinner />;

    return (
        <div className="bg-[#161B22] border border-gray-700 p-6 rounded-lg shadow-md">
            <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-700 rounded-full"></div>
                
                <ul className="space-y-6 relative">
                    {activities.map(activity => (
                        <li key={activity.id} className="relative flex items-start pl-12 group">
                            {/* Icon Node */}
                            <div className="absolute left-0 top-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#161B22] border-2 border-gray-700 group-hover:border-sky-500 group-hover:shadow-md group-hover:shadow-sky-900/20 transition-all z-10">
                                <ActivityIcon type={activity.type} />
                            </div>
                            
                            {/* Content Card */}
                            <div className="flex-1 bg-gray-800/30 p-4 rounded-xl border border-gray-700/50 hover:bg-gray-800 hover:border-gray-600 transition-all duration-200">
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
                                        activity.type === 'Payment' ? 'bg-green-900/20 border-green-900 text-green-400' :
                                        activity.type === 'Bill' ? 'bg-blue-900/20 border-blue-900 text-blue-400' :
                                        'bg-purple-900/20 border-purple-900 text-purple-400'
                                    }`}>
                                        {activity.type}
                                    </span>
                                    <span className="text-xs text-gray-500 flex items-center bg-gray-900/50 px-2 py-1 rounded-md">
                                        <Clock size={10} className="mr-1.5" />
                                        {activity.date.toLocaleString()}
                                    </span>
                                </div>
                                
                                <div>
                                    <div className="text-sm text-gray-300 flex flex-wrap items-center gap-1">
                                        {activity.type === 'Bill' && "Generated bill for"}
                                        {activity.type === 'Payment' && "Payment received from"}
                                        {activity.type === 'Registration' && "Registered new patient"}
                                        
                                        <Link to={`/patients/${activity.patientId}`} className="font-semibold text-white hover:text-sky-400 hover:underline flex items-center gap-1 transition-colors">
                                            {activity.patientName} <ArrowRight size={12} />
                                        </Link>
                                    </div>
                                    
                                    {activity.amount !== undefined && (
                                        <p className={`text-xl font-bold mt-1 ${activity.type === 'Payment' ? 'text-green-400' : 'text-white'}`}>
                                            ${activity.amount.toFixed(2)}
                                        </p>
                                    )}
                                    
                                    <div className="mt-3 pt-3 border-t border-gray-700/50 flex justify-between items-center">
                                        <p className="text-xs text-gray-500">
                                            Processed by <span className="text-gray-400 font-medium">{activity.processedByName}</span>
                                        </p>
                                        {activity.type === 'Bill' && (
                                            <Link to={`/bills/${activity.originalId}`} className="text-xs font-medium text-sky-500 hover:text-sky-400 hover:underline">
                                                View Details
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default DepartmentActivity;
