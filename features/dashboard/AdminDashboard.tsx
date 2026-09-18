import { useOfflineView } from '../../services/useOfflineView';
import { dashboardCounts } from '../../services/lowReadQueries';
import { cachedRead } from '../../services/readCache';
import { usePagedQuery } from '../../services/usePagedQuery';
import LoadMore from '../../components/utils/LoadMore';
import firebase from 'firebase/compat/app';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserPlus, Settings, Activity, ShieldAlert, Database, HeartPulse, BedDouble, LogOut, Search, Mail, Briefcase, Phone, Calendar, Hash, ArrowRight, Bell } from 'lucide-react';
import { db } from '../../services/firebase';
import { UserProfile, Patient, Ward, Bill, Payment, InventoryItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import BedOccupancy from './BedOccupancy';
import WardDetailsModal from './WardDetailsModal';
import UserActivityModal from '../admin/UserActivityModal';
import { useNotification } from '../../context/NotificationContext';

interface AdminStats {
  totalUsers: number;
  allUsers: UserProfile[];
  admittedPatientsCount: number;
  allPatients: Patient[];
  pendingDischarge: number;
  recentNotifications: any[];
}

const AdminSkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`rounded bg-gray-700/50 motion-safe:animate-pulse ${className}`} />
);

const AdminDashboardSkeleton: React.FC = () => (
    <div role="status" aria-busy="true" aria-label="Loading admin dashboard" className="space-y-8">
        <span className="sr-only">Loading admin dashboard...</span>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="space-y-2">
                <AdminSkeletonBlock className="h-8 w-56" />
                <AdminSkeletonBlock className="h-4 w-80 max-w-full" />
            </div>
        </div>

        <div className="rounded-xl border border-gray-700 bg-[#161B22] p-6 shadow-sm">
            <AdminSkeletonBlock className="mb-4 h-6 w-36" />
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => <div key={index} className="flex h-32 flex-col items-center justify-center gap-3 rounded-lg border border-gray-700 bg-gray-800/50 p-6">
                    <AdminSkeletonBlock className="h-12 w-12 rounded-full" />
                    <AdminSkeletonBlock className="h-4 w-24" />
                </div>)}
            </div>
        </div>

        <div>
            <AdminSkeletonBlock className="mb-3 h-6 w-48" />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => <div key={index} className="relative flex min-h-[180px] flex-col justify-between rounded-xl border border-gray-700 bg-[#161B22] p-5">
                    <div className="flex items-start justify-between">
                        <AdminSkeletonBlock className="h-10 w-10 rounded-lg" />
                        <AdminSkeletonBlock className="h-5 w-20 rounded-full" />
                    </div>
                    <div className="space-y-2">
                        <AdminSkeletonBlock className="h-5 w-32" />
                        <div className="flex items-baseline gap-2"><AdminSkeletonBlock className="h-9 w-12" /><AdminSkeletonBlock className="h-4 w-24" /></div>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between"><AdminSkeletonBlock className="h-3 w-14" /><AdminSkeletonBlock className="h-3 w-8" /></div>
                        <AdminSkeletonBlock className="h-2 w-full rounded-full" />
                        <AdminSkeletonBlock className="ml-auto h-3 w-20" />
                    </div>
                </div>)}
            </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex h-full flex-col rounded-xl border border-gray-700 bg-[#161B22] p-6 shadow-sm lg:col-span-2">
                <div className="mb-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
                    <div className="flex items-center gap-2">
                        <AdminSkeletonBlock className="h-5 w-5 rounded-full" />
                        <AdminSkeletonBlock className="h-6 w-36" />
                        <AdminSkeletonBlock className="h-5 w-8 rounded-full" />
                    </div>
                    <AdminSkeletonBlock className="h-10 w-full sm:w-64" />
                </div>
                <div className="overflow-hidden rounded-lg border border-gray-700/50">
                    <div className="grid h-11 grid-cols-2 items-center gap-4 bg-gray-800/50 px-3 sm:grid-cols-3 md:grid-cols-4">
                        <AdminSkeletonBlock className="h-3 w-16" />
                        <AdminSkeletonBlock className="h-3 w-12" />
                        <AdminSkeletonBlock className="hidden h-3 w-20 sm:block" />
                        <AdminSkeletonBlock className="hidden h-3 w-16 md:block" />
                    </div>
                    <div className="divide-y divide-gray-700/50">
                        {Array.from({ length: 5 }, (_, index) => <div key={index} className="grid h-16 grid-cols-2 items-center gap-4 px-3 sm:grid-cols-3 md:grid-cols-4"><div className="flex items-center gap-3"><AdminSkeletonBlock className="h-8 w-8 rounded-full" /><AdminSkeletonBlock className="h-4 flex-1" /></div><AdminSkeletonBlock className="h-5 w-16 rounded-md" /><AdminSkeletonBlock className="hidden h-4 w-24 sm:block" /><AdminSkeletonBlock className="hidden h-4 w-32 md:block" /></div>)}
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-gray-700 bg-[#161B22] p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                    <AdminSkeletonBlock className="h-6 w-40" />
                    <AdminSkeletonBlock className="h-4 w-14" />
                </div>
                <div className="space-y-3">
                    {Array.from({ length: 4 }, (_, index) => <div key={index} className="flex gap-3 rounded-lg bg-gray-800/30 p-3"><AdminSkeletonBlock className="h-4 w-4 shrink-0 rounded-full" /><div className="flex-1 space-y-2"><AdminSkeletonBlock className="h-4 w-3/4" /><AdminSkeletonBlock className="h-3 w-full" /><AdminSkeletonBlock className="h-3 w-1/2" /></div></div>)}
                </div>
            </div>
        </div>
    </div>
);

const AdminDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { addNotification } = useNotification();
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    allUsers: [],
    admittedPatientsCount: 0,
    allPatients: [],
    pendingDischarge: 0,
    recentNotifications: []
  });

  const [backupLoading, setBackupLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null);
  const [isActivityModalOpen, setActivityModalOpen] = useState(false);
  const [selectedUserForActivity, setSelectedUserForActivity] = useState<UserProfile | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => { const timer = setTimeout(() => setSearchTerm(searchQuery.trim().toLowerCase()), 300); return () => clearTimeout(timer); }, [searchQuery]);
  const usersQuery = React.useMemo(() => {
      let query: firebase.firestore.Query = db.collection('users');
      if (searchTerm.length >= 2) query = query.where('searchPrefixes', 'array-contains', searchTerm);
      return query.orderBy('name');
  }, [searchTerm]);
  const userPage = usePagedQuery<UserProfile>(usersQuery, `users:${searchTerm}`);
  const { data: cachedStats, loading } = useOfflineView<AdminStats>(`admin-dashboard:${currentUser?.uid}`, async () => {
    const [counts, notifications] = await Promise.all([
      dashboardCounts(),
      db.collection('notifications').where('recipientId', '==', currentUser!.uid).orderBy('createdAt', 'desc').limit(5).get(),
    ]);
    return { totalUsers: counts.totalUsers, allUsers: [], admittedPatientsCount: counts.admitted,
      allPatients: [], pendingDischarge: counts.pendingDischarge,
      recentNotifications: notifications.docs.map(doc => ({ ...doc.data(), id: doc.id })),
    };
  });
  useEffect(() => { if (cachedStats) setStats(cachedStats); }, [cachedStats]);

  const filteredData = userPage.records;

  const handleViewActivity = (user: UserProfile) => {
    setSelectedUserForActivity(user);
    setActivityModalOpen(true);
  };

  const handleSystemBackup = async () => {
      setBackupLoading(true);
      addNotification("Starting full system backup generation...", "info");

      try {
          // 1. Fetch ALL data collections
          const [usersSnap, patientsSnap, billsSnap, paymentsSnap, inventorySnap, wardsSnap] = await Promise.all([
              db.collection('users').get(),
              db.collection('patients').get(),
              db.collection('bills').get(),
              db.collection('payments').get(),
              db.collection('inventory').get(),
              db.collection('wards').get(),
          ]);

          const users = usersSnap.docs.map(d => d.data() as UserProfile);
          const patients = patientsSnap.docs.map(d => d.data() as Patient);
          const bills = billsSnap.docs.map(d => d.data() as Bill);
          const payments = paymentsSnap.docs.map(d => d.data() as Payment);
          const inventory = inventorySnap.docs.map(d => d.data() as InventoryItem);
          const wards = wardsSnap.docs.map(d => d.data() as Ward);

          // 2. Process Aggregates
          const totalRevenue = bills.reduce((sum, b) => sum + b.totalBill, 0);
          const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
          const totalOutstanding = patients.reduce((sum, p) => sum + p.financials.balance, 0);
          const totalStockValue = inventory.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);

          // 3. Construct HTML Template for Word Doc
          const styles = `
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.5; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2c3e50; padding-bottom: 20px; }
            h1 { color: #2c3e50; font-size: 24pt; margin: 0; }
            h2 { color: #34495e; font-size: 16pt; margin-top: 30px; border-left: 5px solid #3498db; padding-left: 10px; background: #f0f8ff; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10pt; }
            th { background-color: #2c3e50; color: white; padding: 8px; text-align: left; }
            td { border: 1px solid #ddd; padding: 8px; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .kpi-box { display: inline-block; width: 30%; background: #eee; padding: 15px; margin: 1%; border: 1px solid #ccc; text-align: center; }
            .kpi-value { font-size: 14pt; font-weight: bold; display: block; margin-top: 5px; }
            .timestamp { color: #777; font-size: 9pt; text-align: right; }
          `;

          const htmlContent = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset='utf-8'>
                <title>Full System Backup</title>
                <style>${styles}</style>
            </head>
            <body>
                <div class="header">
                    <h1>RCZ MORGENSTER HOSPITAL</h1>
                    <p>Comprehensive System Data Backup & Report</p>
                    <p class="timestamp">Generated: ${new Date().toLocaleString()}</p>
                </div>

                <h2>1. Executive Summary</h2>
                <div>
                    <div class="kpi-box">Total Patients<span class="kpi-value">${patients.length}</span></div>
                    <div class="kpi-box">Total Revenue (Billed)<span class="kpi-value">$${totalRevenue.toFixed(2)}</span></div>
                    <div class="kpi-box">Total Collected<span class="kpi-value">$${totalPaid.toFixed(2)}</span></div>
                    <br/>
                    <div class="kpi-box">Outstanding Balance<span class="kpi-value">$${totalOutstanding.toFixed(2)}</span></div>
                    <div class="kpi-box">Inventory Value<span class="kpi-value">$${totalStockValue.toFixed(2)}</span></div>
                    <div class="kpi-box">System Users<span class="kpi-value">${users.length}</span></div>
                </div>

                <h2>2. Patient Census (All Time)</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Hospital No</th>
                            <th>Name</th>
                            <th>Gender</th>
                            <th>Age</th>
                            <th>Status</th>
                            <th>Registration Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${patients.map(p => `
                            <tr>
                                <td>${p.hospitalNumber}</td>
                                <td>${p.name} ${p.surname}</td>
                                <td>${p.gender}</td>
                                <td>${p.age}</td>
                                <td>${p.status}</td>
                                <td>${new Date(p.registrationDate).toLocaleDateString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <h2>3. Financial Summary - Bills (All Time)</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Bill ID</th>
                            <th>Patient</th>
                            <th>Total Bill</th>
                            <th>Paid</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${bills.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(b => `
                            <tr>
                                <td>${new Date(b.date).toLocaleDateString()}</td>
                                <td>${b.id?.substring(0,8)}</td>
                                <td>${b.patientName}</td>
                                <td>$${b.totalBill.toFixed(2)}</td>
                                <td>$${b.amountPaidAtTimeOfBill.toFixed(2)}</td>
                                <td>${b.status}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <h2>4. Financial Summary - Payments (All Time)</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Patient ID</th>
                            <th>Method</th>
                            <th>Amount</th>
                            <th>Processed By</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${payments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => `
                            <tr>
                                <td>${new Date(p.date).toLocaleDateString()}</td>
                                <td>${p.patientId}</td>
                                <td>${p.paymentMethod}</td>
                                <td>$${p.amount.toFixed(2)}</td>
                                <td>${p.processedByName}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <h2>5. Inventory Status</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Item Name</th>
                            <th>Category</th>
                            <th>Quantity</th>
                            <th>Unit Price</th>
                            <th>Total Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${inventory.map(i => `
                            <tr>
                                <td>${i.name}</td>
                                <td>${i.category}</td>
                                <td>${i.quantity}</td>
                                <td>$${i.unitPrice.toFixed(2)}</td>
                                <td>$${(i.quantity * i.unitPrice).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <h2>6. Ward Status</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Ward Name</th>
                            <th>Total Beds</th>
                            <th>Price Per Day</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${wards.map(w => `
                            <tr>
                                <td>${w.name}</td>
                                <td>${w.totalBeds}</td>
                                <td>$${w.pricePerDay.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <h2>7. Staff Directory</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Role</th>
                            <th>Department</th>
                            <th>Email</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => `
                            <tr>
                                <td>${u.name} ${u.surname}</td>
                                <td>${u.role}</td>
                                <td>${u.department}</td>
                                <td>${u.email}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </body>
            </html>
          `;

          // 4. Trigger Download
          const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(htmlContent);
          const fileDownload = document.createElement("a");
          document.body.appendChild(fileDownload);
          fileDownload.href = source;
          fileDownload.download = `Morgenster_System_Backup_${new Date().toISOString().split('T')[0]}.doc`;
          fileDownload.click();
          document.body.removeChild(fileDownload);

          addNotification("Full system report generated and downloaded successfully.", "success");

      } catch (error) {
          console.error("Backup failed:", error);
          addNotification("Failed to generate system backup.", "error");
      } finally {
          setBackupLoading(false);
      }
  };

    if (loading) return <AdminDashboardSkeleton />;

  return (
    <div className="space-y-8">
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>
                <p className="text-gray-400">Monitor system status and manage resources.</p>
            </div>
        </div>
        
        {/* Quick Actions */}
        <div className="bg-[#161B22] border border-gray-700 p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 <Link to="/admin/users" className="p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-sky-500/50 rounded-lg transition-all flex flex-col items-center justify-center text-center gap-3 group h-32">
                    <div className="p-3 bg-gray-800 rounded-full group-hover:bg-sky-900/30 transition-colors">
                        <Users className="text-sky-400 group-hover:scale-110 transition-transform" size={24} />
                    </div>
                    <span className="text-sm text-gray-300 font-medium group-hover:text-white">Manage Users</span>
                 </Link>
                 <Link to="/accounts/patients" className="p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-green-500/50 rounded-lg transition-all flex flex-col items-center justify-center text-center gap-3 group h-32">
                    <div className="p-3 bg-gray-800 rounded-full group-hover:bg-green-900/30 transition-colors">
                        <HeartPulse className="text-green-400 group-hover:scale-110 transition-transform" size={24} />
                    </div>
                    <span className="text-sm text-gray-300 font-medium group-hover:text-white">Manage Patients</span>
                 </Link>
                 <Link to="/settings" className="p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-purple-500/50 rounded-lg transition-all flex flex-col items-center justify-center text-center gap-3 group h-32">
                    <div className="p-3 bg-gray-800 rounded-full group-hover:bg-purple-900/30 transition-colors">
                        <Settings className="text-purple-400 group-hover:scale-110 transition-transform" size={24} />
                    </div>
                    <span className="text-sm text-gray-300 font-medium group-hover:text-white">System Settings</span>
                 </Link>
                 
                 {/* Backup Action */}
                 <button 
                    onClick={handleSystemBackup} 
                    disabled={backupLoading}
                    className="p-6 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-sky-500/50 rounded-lg transition-all flex flex-col items-center justify-center text-center gap-3 group h-32 w-full focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                     <div className="p-3 bg-gray-800 rounded-full group-hover:bg-sky-900/30 transition-colors">
                        {backupLoading ? (
                            <Activity className="text-sky-500 animate-spin" size={24} />
                        ) : (
                            <Database className="text-gray-400 group-hover:text-sky-400 transition-colors" size={24} />
                        )}
                     </div>
                     <span className="text-sm text-gray-300 font-medium group-hover:text-white">
                         {backupLoading ? "Generating..." : "Data Backups"}
                     </span>
                 </button>
            </div>
        </div>

        {/* Live Bed Occupancy */}
        <div>
            <h3 className="text-lg font-semibold text-white mb-3">Live Bed Occupancy</h3>
            <BedOccupancy onWardClick={setSelectedWard} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Dynamic List Container (System Users) */}
            <div className="lg:col-span-2 bg-[#161B22] border border-gray-700 p-6 rounded-xl shadow-sm h-full flex flex-col transition-all duration-300">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Users size={20} className="text-sky-400" />
                        System Users
                        <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{stats.totalUsers}</span>
                    </h3>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input 
                            type="text" 
                            placeholder={"Filter users..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-800/50 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        />
                    </div>
                </div>
                
                <div className="flex-1 overflow-hidden rounded-lg border border-gray-700/50">
                    <div className="overflow-y-auto max-h-[400px]">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-800/50 sticky top-0 backdrop-blur-sm">
                                <tr>
                                    <th className="p-3 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700">Name</th>
                                    <th className="p-3 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700">Role</th>
                                    <th className="p-3 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 hidden sm:table-cell">Department</th>
                                    <th className="p-3 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 hidden md:table-cell">Email</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700/50">
                                {filteredData.length > 0 ? (
                                    filteredData.map((item: UserProfile) => (
                                        <tr 
                                            key={item.id} 
                                            className="hover:bg-gray-800/30 transition-colors group cursor-pointer"
                                            onClick={() => handleViewActivity(item)}
                                        >
                                            <td className="p-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-sky-900/50 flex items-center justify-center text-sky-400 font-semibold text-xs border border-sky-800">
                                                        {item.name.charAt(0)}{item.surname.charAt(0)}
                                                    </div>
                                                    <span className="font-medium text-gray-200">{item.name} {item.surname}</span>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-800 text-sky-300 border border-gray-700">
                                                    {item.role}
                                                </span>
                                            </td>
                                            <td className="p-3 text-sm text-gray-400 hidden sm:table-cell">
                                                <div className="flex items-center gap-2">
                                                    <Briefcase size={14} className="text-gray-600" />
                                                    {item.department}
                                                </div>
                                            </td>
                                            <td className="p-3 text-sm text-gray-500 hidden md:table-cell font-mono text-xs">
                                                <div className="flex items-center gap-2">
                                                    <Mail size={14} className="text-gray-600" />
                                                    {item.email}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-gray-500">
                                            No users found matching "{searchQuery}"
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Recent Notifications */}
            <div className="bg-[#161B22] border border-gray-700 p-6 rounded-xl shadow-sm">
                <div className="flex justify-between items-center mb-4">
                     <h3 className="text-lg font-semibold text-white">My Notifications</h3>
                     <Link to="/notifications" className="text-xs text-sky-500 hover:underline">View All</Link>
                </div>
                {stats.recentNotifications.length > 0 ? (
                    <div className="space-y-3">
                        {stats.recentNotifications.map((notif: any) => (
                            <div key={notif.id} className={`flex gap-3 p-3 bg-gray-800/30 border ${notif.read ? 'border-gray-700/50' : 'border-sky-900/50 bg-sky-900/10'} rounded-lg items-start`}>
                                <Bell className={`${notif.read ? 'text-gray-500' : 'text-sky-500'} flex-shrink-0 mt-0.5`} size={16} />
                                <div>
                                    <p className={`text-sm font-medium ${notif.read ? 'text-gray-400' : 'text-gray-200'}`}>{notif.title}</p>
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{notif.message}</p>
                                    <p className="text-[10px] text-gray-600 mt-1">
                                        {notif.createdAt?.toDate ? notif.createdAt.toDate().toLocaleString() : 'Just now'}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6 text-gray-500 bg-gray-800/30 rounded-lg">
                        <Bell className="mx-auto mb-2 opacity-50" size={24} />
                        <p className="text-sm">No recent notifications.</p>
                    </div>
                )}
            </div>
        </div>
        {selectedWard && <WardDetailsModal ward={selectedWard} onClose={() => setSelectedWard(null)} />}
        
        {selectedUserForActivity && (
            <UserActivityModal 
                isOpen={isActivityModalOpen} 
                onClose={() => setActivityModalOpen(false)} 
                user={selectedUserForActivity} 
            />
        )}
      <LoadMore hasMore={userPage.hasMore} loading={userPage.loadingMore} error={userPage.error} indexUrl={userPage.indexUrl} onLoad={userPage.loadMore} onRetry={userPage.refresh} />
    </div>
  );
};

export default AdminDashboard;