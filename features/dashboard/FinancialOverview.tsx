import { financialSummary } from '../../services/lowReadQueries';
import React, { useEffect, useState } from 'react';
import { db } from '../../services/firebase';
import { Bill, Payment, Patient } from '../../types';

interface FinancialStats {
    monthlySales: number;
    monthlyPaid: number;
    totalUnpaid: number;
}

const FinancialOverview: React.FC = () => {
    const [stats, setStats] = useState<FinancialStats>({ monthlySales: 0, monthlyPaid: 0, totalUnpaid: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            try {
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

                setStats(await financialSummary(startOfMonth, endOfMonth));
            } catch (error) {
                console.error("Error fetching financial overview:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) {
        return (
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-gray-800 p-4 rounded-lg animate-pulse h-24"></div>
                <div className="bg-gray-800 p-4 rounded-lg animate-pulse h-24"></div>
                <div className="bg-gray-800 p-4 rounded-lg animate-pulse h-24"></div>
            </div>
        );
    }
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="text-gray-400">Total Monthly Sales</h3>
                <p className="text-2xl font-bold text-sky-400">${stats.monthlySales.toFixed(2)}</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="text-gray-400">Total Paid This Month</h3>
                <p className="text-2xl font-bold text-green-400">${stats.monthlyPaid.toFixed(2)}</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="text-gray-400">Total Outstanding Balance</h3>
                <p className="text-2xl font-bold text-red-400">${stats.totalUnpaid.toFixed(2)}</p>
            </div>
        </div>
    );
};

export default FinancialOverview;
