import { cachedRead } from '../../services/readCache';
import { countRecords, storedSummary } from '../../services/lowReadQueries';

import React, { useEffect, useState } from 'react';
import { db } from '../../services/firebase';
import { Ward, Patient } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import { BedDouble, Activity, Users } from 'lucide-react';

interface OccupancyData {
  ward: Ward;
  occupied: number;
}

interface BedOccupancyProps {
    onWardClick: (ward: Ward) => void;
}

const BedOccupancy: React.FC<BedOccupancyProps> = ({ onWardClick }) => {
    const [occupancy, setOccupancy] = useState<OccupancyData[]>([]);
    const [loading, setLoading] = useState(true);
    const { addNotification } = useNotification();

    useEffect(() => {
        const fetchOccupancy = async () => {
            setLoading(true);
            try {
                const wardsSnapshot = await cachedRead('wards:all', () => db.collection('wards').get(), 300_000);
                const wards = wardsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ward));

                const occupancyData = await storedSummary('summaries/ward-occupancy', () => Promise.all(wards.map(async ward => ({
                    ward, occupied: await countRecords('patients', [['currentWardId', '==', ward.id], ['status', 'in', ['Admitted', 'PendingDischarge']]]),
                }))), 60_000);

                setOccupancy(occupancyData);

            } catch (error) {
                console.error("Error fetching bed occupancy:", error);
                addNotification('Failed to load bed occupancy data.', 'error');
            } finally {
                setLoading(false);
            }
        };

        fetchOccupancy();
    }, [addNotification]);
    
    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-[#161B22] border border-gray-700 rounded-xl h-40 animate-pulse"></div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {occupancy.map(({ ward, occupied }) => {
                const percentage = ward.totalBeds > 0 ? Math.round((occupied / ward.totalBeds) * 100) : 0;
                const available = ward.totalBeds - occupied;
                const isFull = available <= 0;
                
                // Color Logic
                let statusColor = 'text-emerald-400';
                let barColor = 'bg-emerald-500';
                let borderColor = 'border-gray-700/50';
                
                if (isFull) {
                    statusColor = 'text-red-400';
                    barColor = 'bg-red-500';
                    borderColor = 'border-red-900/30';
                } else if (percentage >= 80) {
                    statusColor = 'text-orange-400';
                    barColor = 'bg-orange-500';
                    borderColor = 'border-orange-900/30';
                }

                return (
                    <button 
                        key={ward.id} 
                        onClick={() => onWardClick(ward)}
                        className={`group relative flex flex-col justify-between bg-[#161B22] border ${borderColor} rounded-xl p-5 hover:border-sky-500/50 hover:shadow-lg hover:shadow-sky-900/10 transition-all duration-300 text-left overflow-hidden h-full min-h-[180px]`}
                    >
                        {/* Decorative Background Icon */}
                        <div className="absolute -bottom-4 -right-4 text-gray-800 opacity-20 group-hover:scale-110 transition-transform duration-500">
                            <BedDouble size={100} />
                        </div>

                        {/* Header */}
                        <div className="flex justify-between items-start z-10 mb-2">
                            <div className={`p-2 rounded-lg bg-gray-800/80 backdrop-blur-sm border border-gray-700 group-hover:border-sky-500/30 transition-colors`}>
                                <BedDouble size={20} className={statusColor} />
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full border uppercase tracking-wider ${isFull ? 'bg-red-900/20 border-red-800 text-red-400' : 'bg-emerald-900/20 border-emerald-800 text-emerald-400'}`}>
                                {isFull ? 'Full' : 'Available'}
                            </span>
                        </div>

                        {/* Content */}
                        <div className="z-10">
                            <h3 className="text-lg font-bold text-white truncate mb-1">{ward.name}</h3>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-extrabold text-white">{occupied}</span>
                                <span className="text-sm text-gray-400 font-medium">/ {ward.totalBeds} Occupied</span>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="z-10 mt-4">
                            <div className="flex justify-between text-xs text-gray-500 mb-1.5 font-medium">
                                <span>Capacity</span>
                                <span>{percentage}%</span>
                            </div>
                            <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden border border-gray-700">
                                <div 
                                    className={`h-full rounded-full transition-all duration-500 ${barColor}`} 
                                    style={{ width: `${percentage}%` }}
                                ></div>
                            </div>
                            <p className="text-xs text-gray-400 mt-2 text-right">
                                {available} bed{available !== 1 ? 's' : ''} free
                            </p>
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

export default BedOccupancy;
