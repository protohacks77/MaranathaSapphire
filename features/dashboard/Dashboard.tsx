import { usePagedQuery } from '../../services/usePagedQuery';
import LoadMore from '../../components/utils/LoadMore';
import firebase from 'firebase/compat/app';
import { dashboardCounts, countRecords } from '../../services/lowReadQueries';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Role, Ward, Patient, InventoryItem } from '../../types';
import { Link } from 'react-router-dom';
import { UserPlus, DollarSign, UserCheck, Search, Package, Users, BedDouble, Zap } from 'lucide-react';
import DepartmentActivity from './DepartmentActivity';
import FinancialOverview from './FinancialOverview';
import AdminDashboard from './AdminDashboard';
import { db } from '../../services/firebase';
import BedOccupancy from './BedOccupancy';
import WardDetailsModal from './WardDetailsModal';
import LoadingSpinner from '../../components/utils/LoadingSpinner';
import PatientSearch from './PatientSearch';
import AwaitingDispensing from '../pharmacy/AwaitingDispensing';

// Animated Welcome Toast Component
const WelcomeToast = ({ name }: { name: string }) => {
    const [visible, setVisible] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);

    useEffect(() => {
        // Only show if we haven't shown it this session AND we have a valid name (not the default 'User')
        const hasSeenWelcome = sessionStorage.getItem('welcomeShown');
        
        if (!hasSeenWelcome && name && name !== 'User') {
            setShouldRender(true);
            // Small delay to allow fade-in animation to trigger after render
            const startTimer = setTimeout(() => setVisible(true), 100);
            
            // Mark as seen immediately so refreshing doesn't spam it, 
            // but rely on session storage so closing/reopening browser resets it (standard session behavior)
            sessionStorage.setItem('welcomeShown', 'true');
            
            const hideTimer = setTimeout(() => setVisible(false), 4000); // Visible for 4 seconds
            const removeTimer = setTimeout(() => setShouldRender(false), 4600); // Unmount after animation
            
            return () => { 
                clearTimeout(startTimer); 
                clearTimeout(hideTimer); 
                clearTimeout(removeTimer); 
            };
        }
    }, [name]);

    if (!shouldRender) return null;

    return (
        <div className={`welcome-toast ${visible ? 'show' : 'hide'}`}>
            <div className="p-2 bg-sky-500/20 rounded-full border border-sky-400/50 shadow-[0_0_15px_rgba(56,189,248,0.5)]">
                <Zap size={24} className="text-sky-400 fill-sky-400" />
            </div>
            <div>
                <p className="text-xs text-sky-200 font-medium uppercase tracking-wider">Welcome back</p>
                <p className="text-lg font-bold text-white leading-tight">{name}</p>
            </div>
        </div>
    );
};

const DoctorDashboard = () => {
    const [selectedWard, setSelectedWard] = useState<Ward | null>(null);
    return (
        <div>
            <div className="mb-8">
                <PatientSearch />
            </div>
            <div className="mb-8">
                <h3 className="text-lg font-semibold text-white mb-3">Bed Occupancy</h3>
                <BedOccupancy onWardClick={setSelectedWard} />
            </div>
            {selectedWard && <WardDetailsModal ward={selectedWard} onClose={() => setSelectedWard(null)} />}
        </div>
    );
};


const AccountsClerkDashboard = () => (
    <div>
        <div className="flex flex-col sm:flex-row gap-4 mt-8">
            <Link to="/accounts/register" className="flex items-center justify-center gap-3 px-6 py-3 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-sky-500 transition-colors">
                <UserPlus size={20} />
                Register New Patient
            </Link>
            <Link to="/accounts/billing" className="flex items-center justify-center gap-3 px-6 py-3 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-gray-500 transition-colors">
                <DollarSign size={20} />
                Manage Billing
            </Link>
        </div>
    </div>
);

const NurseDashboard = () => {
    const [selectedWard, setSelectedWard] = useState<Ward | null>(null);
    return (
        <div>
             <div className="mb-8">
                <PatientSearch />
            </div>
            <div className="mb-8">
                <h3 className="text-lg font-semibold text-white mb-3">Bed Occupancy</h3>
                <BedOccupancy onWardClick={setSelectedWard} />
            </div>
             {selectedWard && <WardDetailsModal ward={selectedWard} onClose={() => setSelectedWard(null)} />}
        </div>
    );
};

const DefaultDashboard = () => <div></div>;

const AccountantDashboard = () => {
    const [pendingDischarges, setPendingDischarges] = useState(0);
    const [selectedWard, setSelectedWard] = useState<Ward | null>(null);

    useEffect(() => {
        countRecords('patients', [['status', '==', 'PendingDischarge']]).then(setPendingDischarges).catch(console.error);
    }, []);

    return (
      <div className="space-y-8">
        {pendingDischarges > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700/50 p-4 rounded-lg flex items-center justify-between animate-pulse-slow">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-yellow-900/50 rounded-full text-yellow-400">
                        <UserCheck size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Discharge Approvals Pending</h3>
                        <p className="text-yellow-200/80 text-sm">
                            {pendingDischarges} patient{pendingDischarges !== 1 ? 's' : ''} waiting for financial clearance.
                        </p>
                    </div>
                </div>
                <Link to="/accounts/discharge-approval" className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-md font-medium text-sm transition-colors">
                    Review Requests
                </Link>
            </div>
        )}
        
        {/* 1. Financial Overview (Priority) */}
        <div>
            <h2 className="text-xl font-semibold mb-4 text-white">Financial Overview</h2>
            <FinancialOverview />
        </div>

        {/* 2. Quick Actions (Expanded to 4) */}
        <div>
            <h2 className="text-xl font-semibold mb-4 text-white">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link to="/accounts/register" className="flex flex-col items-center justify-center p-6 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-750 hover:border-sky-500/50 hover:shadow-lg hover:shadow-sky-900/20 transition-all group">
                    <div className="p-3 bg-sky-900/30 rounded-full text-sky-400 mb-3 group-hover:scale-110 transition-transform">
                        <UserPlus size={24} />
                    </div>
                    <span className="font-semibold text-gray-200">Register Patient</span>
                </Link>
                
                <Link to="/accounts/billing" className="flex flex-col items-center justify-center p-6 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-750 hover:border-green-500/50 hover:shadow-lg hover:shadow-green-900/20 transition-all group">
                    <div className="p-3 bg-green-900/30 rounded-full text-green-400 mb-3 group-hover:scale-110 transition-transform">
                        <DollarSign size={24} />
                    </div>
                    <span className="font-semibold text-gray-200">Manage Billing</span>
                </Link>

                <Link to="/accounts/discharge-approval" className="flex flex-col items-center justify-center p-6 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-750 hover:border-yellow-500/50 hover:shadow-lg hover:shadow-yellow-900/20 transition-all group">
                    <div className="p-3 bg-yellow-900/30 rounded-full text-yellow-400 mb-3 group-hover:scale-110 transition-transform">
                        <UserCheck size={24} />
                    </div>
                    <span className="font-semibold text-gray-200">Discharge Approval</span>
                </Link>

                <Link to="/pharmacy/inventory" className="flex flex-col items-center justify-center p-6 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-750 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-900/20 transition-all group">
                    <div className="p-3 bg-purple-900/30 rounded-full text-purple-400 mb-3 group-hover:scale-110 transition-transform">
                        <Package size={24} />
                    </div>
                    <span className="font-semibold text-gray-200">Inventory</span>
                </Link>
            </div>
        </div>

        {/* 3. Bed Occupancy */}
        <div>
            <h3 className="text-lg font-semibold text-white mb-3">Live Bed Occupancy</h3>
            <BedOccupancy onWardClick={setSelectedWard} />
        </div>

        {/* 4. Department Activity */}
        <div>
            <h2 className="text-xl font-semibold mb-4 text-white">Department Activity</h2>
            <DepartmentActivity />
        </div>
        
        {selectedWard && <WardDetailsModal ward={selectedWard} onClose={() => setSelectedWard(null)} />}
      </div>
    );
};

// Reusable component for displaying admitted patients, used by various roles
const AdmittedPatientsList: React.FC<{ title?: string; message?: string }> = ({ title = "Currently Admitted Patients", message }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    useEffect(() => { const timer = setTimeout(() => setSearchTerm(searchQuery.trim().toLowerCase()), 300); return () => clearTimeout(timer); }, [searchQuery]);
    const admittedQuery = useMemo(() => {
        let query: firebase.firestore.Query = db.collection('patients').where('status', '==', 'Admitted');
        if (searchTerm.length >= 2) query = query.where('searchPrefixes', 'array-contains', searchTerm);
        return query.orderBy('name');
    }, [searchTerm]);
    const { records: filteredPatients, loading, loadingMore, hasMore, error, indexUrl, loadMore, refresh } = usePagedQuery<Patient>(admittedQuery, `admitted:${searchTerm}`);

    return (
        <div className="bg-[#161B22] border border-gray-700 p-6 rounded-lg shadow-md mt-8">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search admitted patients..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                </div>
            </div>
            {message && <p className="text-sm text-gray-400 mb-4 -mt-2">{message}</p>}
            {loading ? <LoadingSpinner /> : (
                <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-700/50 sticky top-0">
                            <tr>
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3">Hospital No.</th>
                                <th className="px-4 py-3">Ward & Bed</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {filteredPatients.length > 0 ? filteredPatients.map(p => (
                                <tr key={p.id} className="hover:bg-gray-800">
                                    <td className="px-4 py-3 font-medium text-white">{p.name} {p.surname}</td>
                                    <td className="px-4 py-3">{p.hospitalNumber}</td>
                                    <td className="px-4 py-3">{p.currentWardName} - Bed {p.currentBedNumber}</td>
                                    <td className="px-4 py-3 text-right">
                                        <Link to={`/patients/${p.id}`} className="font-medium text-sky-500 hover:underline">
                                            View Profile
                                        </Link>
                                    </td>
                                </tr>
                            )) : (
                                 <tr>
                                    <td colSpan={4} className="text-center py-8 text-gray-500">
                                        No admitted patients found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            <LoadMore hasMore={hasMore} loading={loadingMore} error={error} indexUrl={indexUrl} onLoad={loadMore} onRetry={refresh} />
        </div>
    );
};

const VitalsCheckerDashboard = () => {
    return (
        <div>
            <div className="mb-8">
                <Link to="/accounts/patients" className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-sky-500 transition-colors text-lg">
                    <Search size={24} />
                    Find Patient
                </Link>
            </div>
            <AdmittedPatientsList />
        </div>
    );
};

const PharmacyDashboard = () => {
    const [lowStockCount, setLowStockCount] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        dashboardCounts().then(counts => setLowStockCount(counts.lowStock)).catch(console.error).finally(() => setLoading(false));
    }, []);

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link to="/pharmacy/inventory" className="flex flex-col items-center justify-center p-6 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors">
                    <Package size={32} className="mb-2 text-sky-400" />
                    Manage Inventory
                </Link>
                <Link to="/accounts/patients" className="flex flex-col items-center justify-center p-6 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors">
                    <Users size={32} className="mb-2 text-sky-400" />
                    Find Patient
                </Link>
                <div className={`p-6 rounded-lg ${lowStockCount > 0 ? 'bg-red-900/50 border border-red-700' : 'bg-gray-800'}`}>
                    <h3 className="text-center text-gray-300">Low Stock Items</h3>
                    {loading ? <div className="h-10 mt-2 w-16 mx-auto bg-gray-700 rounded animate-pulse"></div> : (
                         <p className={`text-center text-4xl font-bold mt-2 ${lowStockCount > 0 ? 'text-red-400' : 'text-green-400'}`}>{lowStockCount}</p>
                    )}
                </div>
            </div>

            <AwaitingDispensing />
            <AdmittedPatientsList title="In-Patients" message="Check patient profiles for new prescription orders." />
        </div>
    );
}

const ClinicalSupportDashboard: React.FC<{ role: Role }> = ({ role }) => {
    const messageMap: Record<string, string> = {
        [Role.LaboratoryTechnician]: "Review patient charts for new laboratory test orders.",
        [Role.Radiologist]: "Review patient charts for new radiology/x-ray orders.",
        [Role.RehabilitationTechnician]: "Review patient charts for new rehabilitation notes and plans.",
    };

    return (
        <div>
            <div className="mb-8">
                <Link to="/accounts/patients" className="inline-flex items-center justify-center gap-3 px-6 py-3 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 transition-colors">
                    <Search size={20} />
                    Find Patient
                </Link>
            </div>
            <AdmittedPatientsList message={messageMap[role]} />
        </div>
    );
};


const Dashboard: React.FC = () => {
  const { userProfile } = useAuth();

  const renderDashboard = () => {
    if (!userProfile) {
      return <DefaultDashboard />;
    }

    switch (userProfile.role) {
      case Role.Admin:
        return <AdminDashboard />;
      case Role.Doctor:
        return <DoctorDashboard />;
      case Role.Accountant:
      case Role.AccountsAssistant:
        return <AccountantDashboard />;
      case Role.AccountsClerk:
        return <AccountsClerkDashboard />;
      case Role.Nurse:
        return <NurseDashboard />;
      case Role.VitalsChecker:
        return <VitalsCheckerDashboard />;
      case Role.Pharmacist:
        case Role.PharmacyTechnician:
      case Role.DispensaryAssistant:
        return <PharmacyDashboard />;
      case Role.LaboratoryTechnician:
      case Role.Radiologist:
      case Role.RehabilitationTechnician:
        return <ClinicalSupportDashboard role={userProfile.role} />;
      default:
        return <DefaultDashboard />;
    }
  };

  return (
    <div>
      <WelcomeToast name={userProfile ? `${userProfile.name} ${userProfile.surname}` : 'User'} />
      <div className="p-0">
        {renderDashboard()}
      </div>
    </div>
  );
};

export default Dashboard;
