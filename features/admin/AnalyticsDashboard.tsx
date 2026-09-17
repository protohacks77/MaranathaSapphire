import { cachedRead } from '../../services/readCache';
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../services/firebase';
import { Bill, Patient, UserProfile, PriceListItem } from '../../types';
import LoadingSpinner from '../../components/utils/LoadingSpinner';
import { DollarSign, UserPlus, FileText, BarChart2, Users, Briefcase } from 'lucide-react';
import LineChart from '../../components/charts/LineChart';
import BarChart from '../../components/charts/BarChart';

type Period = '7d' | '30d' | '90d';

const AnalyticsDashboard: React.FC = () => {
    const [period, setPeriod] = useState<Period>('30d');
    const [loading, setLoading] = useState(true);
    const [allData, setAllData] = useState<{
        bills: Bill[];
        patients: Patient[];
        users: UserProfile[];
        priceList: Map<string, string>;
    } | null>(null);

    useEffect(() => {
        let cancelled = false;
        const fetchData = async () => {
            setLoading(true);
            try {
                const [billsSnap, patientsSnap, usersSnap, priceListSnap] = await Promise.all([
                    cachedRead(`analytics:bills:${period}`, () => db.collection('bills').where('date', '>=', new Date(Date.now() - Number(period.slice(0, -1)) * 86400000).toISOString()).get()),
                    cachedRead(`analytics:patients:${period}`, () => db.collection('patients').where('registrationDate', '>=', new Date(Date.now() - Number(period.slice(0, -1)) * 86400000).toISOString()).get()),
                    cachedRead('analytics:users', () => db.collection('users').get(), 300_000),
                    cachedRead('analytics:prices', () => db.collection('priceList').get(), 300_000),
                ]);

                const priceListMap = new Map<string, string>();
                priceListSnap.docs.forEach(doc => {
                    const item = doc.data() as PriceListItem;
                    priceListMap.set(item.name, item.department);
                });

                if (cancelled) return;
                setAllData({
                    bills: billsSnap.docs.map(doc => doc.data() as Bill),
                    patients: patientsSnap.docs.map(doc => doc.data() as Patient),
                    users: usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile)),
                    priceList: priceListMap,
                });
            } catch (error) {
                console.error("Error fetching analytics data:", error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchData();
        return () => { cancelled = true; };
    }, [period]);

    const dateRange = useMemo(() => {
        const end = new Date();
        const start = new Date();
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        start.setDate(end.getDate() - days);
        return { start, end };
    }, [period]);

    const filteredData = useMemo(() => {
        if (!allData) return null;
        const { bills, patients } = allData;
        const { start, end } = dateRange;

        const filteredBills = bills.filter(b => {
            const billDate = new Date(b.date);
            return billDate >= start && billDate <= end;
        });

        const filteredPatients = patients.filter(p => {
            const regDate = new Date(p.registrationDate);
            return regDate >= start && regDate <= end;
        });

        return { filteredBills, filteredPatients };
    }, [allData, dateRange]);

    const stats = useMemo(() => {
        if (!filteredData) return { totalRevenue: 0, newAdmissions: 0, billsProcessed: 0, avgRevenue: 0 };
        const { filteredBills, filteredPatients } = filteredData;

        const totalRevenue = filteredBills.reduce((sum, bill) => sum + bill.totalBill, 0);
        const newAdmissions = filteredPatients.length;
        const billsProcessed = filteredBills.length;
        const uniquePatientsBilled = new Set(filteredBills.map(b => b.patientId)).size;
        const avgRevenue = uniquePatientsBilled > 0 ? totalRevenue / uniquePatientsBilled : 0;

        return { totalRevenue, newAdmissions, billsProcessed, avgRevenue };
    }, [filteredData]);

    const chartData = useMemo(() => {
        if (!filteredData || !allData) return { admissions: [], revenueByDept: [], staffProductivity: [] };
        
        // 1. Admissions Trend Data
        const admissionsByDay: { [key: string]: number } = {};
        // Initialize days
        for (let d = new Date(dateRange.start); d <= dateRange.end; d.setDate(d.getDate() + 1)) {
            admissionsByDay[d.toISOString().split('T')[0]] = 0;
        }
        filteredData.filteredPatients.forEach(p => {
            const dateStr = new Date(p.registrationDate).toISOString().split('T')[0];
            if (admissionsByDay[dateStr] !== undefined) {
                admissionsByDay[dateStr]++;
            }
        });
        const admissions = Object.entries(admissionsByDay)
            .sort((a,b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
            .map(([date, count]) => ({ date, value: count }));

        // 2. Revenue by Department
        const revenueByDeptMap: { [key: string]: number } = {};
        filteredData.filteredBills.forEach(bill => {
            bill.items.forEach(item => {
                const department = item.department || allData.priceList.get(item.description) || 'Uncategorized';
                revenueByDeptMap[department] = (revenueByDeptMap[department] || 0) + item.totalPrice;
            });
        });
        const revenueByDept = Object.entries(revenueByDeptMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        // 3. Staff Productivity
        const staffActivity: { [id: string]: { name: string; registrations: number; bills: number; } } = {};
        allData.users.forEach(u => {
            staffActivity[u.id] = { name: `${u.name} ${u.surname}`, registrations: 0, bills: 0 };
        });
        filteredData.filteredPatients.forEach(p => {
            if (staffActivity[p.registeredBy]) {
                staffActivity[p.registeredBy].registrations++;
            }
        });
        filteredData.filteredBills.forEach(b => {
            if (staffActivity[b.processedBy]) {
                staffActivity[b.processedBy].bills++;
            }
        });
        const staffProductivity = Object.values(staffActivity)
            .filter(s => s.registrations > 0 || s.bills > 0)
            .sort((a, b) => (b.registrations + b.bills) - (a.registrations + a.bills));

        return { admissions, revenueByDept, staffProductivity };
    }, [filteredData, allData, dateRange]);


    if (loading) return <LoadingSpinner />;

    const KpiCard = ({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) => (
        <div className="bg-[#161B22] border border-gray-700 p-6 rounded-xl shadow-sm flex flex-col justify-between h-full">
            <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-400">{title}</span>
                <div className="p-2 bg-gray-800 rounded-lg">
                    {icon}
                </div>
            </div>
            <p className="text-2xl font-bold text-white mt-4">{value}</p>
        </div>
    );
    
    const DateButton: React.FC<{ value: Period; children: React.ReactNode }> = ({ value, children }) => (
        <button
            onClick={() => setPeriod(value)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${period === value ? 'bg-sky-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
            {children}
        </button>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Analytics Dashboard</h1>
                    <p className="text-gray-400 mt-1">Hospital performance overview</p>
                </div>
                <div className="flex items-center gap-2 bg-[#161B22] border border-gray-700 p-1 rounded-lg">
                    <DateButton value="7d">Last 7 Days</DateButton>
                    <DateButton value="30d">Last 30 Days</DateButton>
                    <DateButton value="90d">Last 90 Days</DateButton>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <KpiCard title="Total Revenue" value={`$${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={<DollarSign size={20} className="text-green-400" />} />
                <KpiCard title="New Admissions" value={stats.newAdmissions.toLocaleString()} icon={<UserPlus size={20} className="text-sky-400" />} />
                <KpiCard title="Bills Processed" value={stats.billsProcessed.toLocaleString()} icon={<FileText size={20} className="text-purple-400" />} />
                <KpiCard title="Avg. Revenue / Patient" value={`$${stats.avgRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={<BarChart2 size={20} className="text-yellow-400" />} />
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 bg-[#161B22] border border-gray-700 p-6 rounded-xl shadow-sm h-[450px] flex flex-col">
                    <h3 className="text-lg font-semibold text-white mb-4">Admission Trends</h3>
                    <div className="flex-1 w-full min-h-0 relative">
                        <LineChart data={chartData.admissions} />
                    </div>
                </div>
                <div className="bg-[#161B22] border border-gray-700 p-6 rounded-xl shadow-sm h-[450px] flex flex-col">
                    <h3 className="text-lg font-semibold text-white mb-4">Revenue by Department</h3>
                    <div className="flex-1 w-full min-h-0 relative">
                        <BarChart data={chartData.revenueByDept} />
                    </div>
                </div>
            </div>
            
            <div className="bg-[#161B22] border border-gray-700 p-6 rounded-xl shadow-sm">
                 <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Briefcase size={20} className="text-sky-400"/> Staff Productivity Leaderboard</h3>
                 <div className="overflow-x-auto max-h-96 rounded-lg border border-gray-700/50">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-800 sticky top-0">
                            <tr>
                                <th className="px-6 py-4 font-medium">Staff Member</th>
                                <th className="px-6 py-4 text-center">Registrations</th>
                                <th className="px-6 py-4 text-center">Bills Processed</th>
                                <th className="px-6 py-4 text-center">Total Activity</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {chartData.staffProductivity.length > 0 ? (
                                chartData.staffProductivity.slice().reverse().map((staff, idx) => (
                                    <tr key={idx} className="hover:bg-gray-800/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 border border-gray-600">
                                                {idx + 1}
                                            </div>
                                            {staff.name}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="inline-block px-2 py-1 bg-purple-900/30 text-purple-300 rounded text-xs font-bold">{staff.registrations}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="inline-block px-2 py-1 bg-blue-900/30 text-blue-300 rounded text-xs font-bold">{staff.bills}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center font-bold text-white">
                                            {staff.registrations + staff.bills}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-gray-500">No activity data available for this period.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AnalyticsDashboard;