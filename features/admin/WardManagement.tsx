
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { db } from '../../services/firebase';
import { Ward, Patient } from '../../types';
import LoadingSpinner from '../../components/utils/LoadingSpinner';
import { Edit, Plus, Search, Trash2, BedDouble, AlertTriangle, DollarSign } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import Modal from '../../components/utils/Modal';

// Add/Edit Ward Modal Component
const WardModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  ward?: Ward | null;
}> = ({ isOpen, onClose, onSuccess, ward }) => {
  const [name, setName] = useState('');
  const [totalBeds, setTotalBeds] = useState('');
  const [pricePerDay, setPricePerDay] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const { addNotification } = useNotification();

  useEffect(() => {
    if (ward) {
      setName(ward.name);
      setTotalBeds(ward.totalBeds.toString());
      setPricePerDay(ward.pricePerDay.toString());
    } else {
      setName('');
      setTotalBeds('');
      setPricePerDay('');
    }
  }, [ward, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const beds = parseInt(totalBeds, 10);
    const price = parseFloat(pricePerDay);
    if (isNaN(beds) || beds <= 0) {
      addNotification('Please enter a valid number of beds.', 'warning');
      return;
    }
    if (isNaN(price) || price < 0) {
        addNotification('Please enter a valid price per day.', 'warning');
        return;
    }
    setStatus('loading');
    try {
      const wardData = { name, totalBeds: beds, pricePerDay: price };
      if (ward) {
        await db.collection('wards').doc(ward.id).update(wardData);
        addNotification('Ward updated successfully!', 'success');
      } else {
        const docId = name.toLowerCase().replace(/\s+/g, '-');
        await db.collection('wards').doc(docId).set(wardData);
        addNotification('Ward added successfully!', 'success');
      }
      setStatus('success');
      setTimeout(() => {
        onSuccess();
        onClose();
        setStatus('idle');
      }, 1500);
    } catch (error) {
      console.error("Error saving ward:", error);
      addNotification('Failed to save ward.', 'error');
      setStatus('idle');
    }
  };
  
  const getButtonText = () => {
    switch (status) {
        case 'loading': return 'Saving...';
        case 'success': return 'Ward Saved!';
        default: return 'Save Ward';
    }
  };


  return (
    <Modal isOpen={isOpen} onClose={onClose} title={ward ? 'Edit Ward' : 'Add New Ward'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="text" placeholder="Ward Name" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white modern-input" />
        <input type="number" placeholder="Total Beds" value={totalBeds} onChange={(e) => setTotalBeds(e.target.value)} required min="1" className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white modern-input" />
        <input type="number" placeholder="Price Per Day ($)" value={pricePerDay} onChange={(e) => setPricePerDay(e.target.value)} required min="0" step="0.01" className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white modern-input" />
        <div className="flex justify-end space-x-4 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
          <button type="submit" disabled={status !== 'idle'} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:bg-sky-800">
            {getButtonText()}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const WardManagement: React.FC = () => {
    const [wards, setWards] = useState<Ward[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [isAddEditModalOpen, setAddEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedWard, setSelectedWard] = useState<Ward | null>(null);
    const { addNotification } = useNotification();

    const fetchWards = useCallback(async () => {
        setLoading(true);
        try {
            const snapshot = await db.collection('wards').orderBy('name').get();
            const wardList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ward));
            setWards(wardList);
        } catch (error) {
            console.error("Error fetching wards:", error);
            addNotification('Failed to fetch wards.', 'error');
        } finally {
            setLoading(false);
        }
    }, [addNotification]);

    useEffect(() => {
        fetchWards();
    }, [fetchWards]);

    const filteredWards = useMemo(() => {
        if (!searchQuery) return wards;
        return wards.filter(ward => ward.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [searchQuery, wards]);
    
    const handleAdd = () => {
        setSelectedWard(null);
        setAddEditModalOpen(true);
    };

    const handleEdit = (ward: Ward) => {
        setSelectedWard(ward);
        setAddEditModalOpen(true);
    };

    const handleDelete = (ward: Ward) => {
        setSelectedWard(ward);
        setDeleteModalOpen(true);
    }
    
    const confirmDelete = async () => {
        if (!selectedWard) return;

        try {
            // Safety check: ensure no patients are currently in this ward
            const patientsInWard = await db.collection('patients')
                .where('status', 'in', ['Admitted', 'PendingDischarge'])
                .where('currentWardId', '==', selectedWard.id)
                .get();

            if (!patientsInWard.empty) {
                const count = patientsInWard.size;
                addNotification(`Denied: This ward has ${count} active patient${count > 1 ? 's' : ''}. Discharge or transfer them first.`, 'error');
                setDeleteModalOpen(false);
                return;
            }

            await db.collection('wards').doc(selectedWard.id).delete();
            addNotification('Ward deleted successfully.', 'success');
            setDeleteModalOpen(false);
            setSelectedWard(null);
            fetchWards(); // Refetch
        } catch (error) {
            console.error("Error deleting ward:", error);
            addNotification('Failed to delete ward.', 'error');
        }
    }

    if (loading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-white">Ward Management</h1>
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input type="text" placeholder="Search wards..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    <button onClick={handleAdd} className="flex items-center justify-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500">
                        <Plus size={18} />
                        <span className="hidden sm:inline">Add Ward</span>
                    </button>
                </div>
            </div>

             <div className="bg-[#161B22] border border-gray-700 rounded-lg shadow-md overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                        <tr>
                            <th scope="col" className="px-6 py-3">Ward Name</th>
                            <th scope="col" className="px-6 py-3 text-center">Total Beds</th>
                            <th scope="col" className="px-6 py-3 text-center">Price Per Day</th>
                            <th scope="col" className="px-6 py-3 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredWards.map(ward => (
                            <tr key={ward.id} className="bg-[#161B22] border-b border-gray-700 hover:bg-gray-800">
                                <td className="px-6 py-4 font-medium text-white whitespace-nowrap">{ward.name}</td>
                                <td className="px-6 py-4 text-center">{ward.totalBeds}</td>
                                <td className="px-6 py-4 text-center text-green-400 font-semibold">${ward.pricePerDay?.toFixed(2) || '0.00'}</td>
                                <td className="px-6 py-4 text-center">
                                    <div className="flex justify-center space-x-4">
                                        <button onClick={() => handleEdit(ward)} className="text-sky-500 hover:text-sky-400"><Edit size={18} /></button>
                                        <button onClick={() => handleDelete(ward)} className="text-red-500 hover:text-red-400"><Trash2 size={18} /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
            
            <WardModal isOpen={isAddEditModalOpen} onClose={() => setAddEditModalOpen(false)} onSuccess={fetchWards} ward={selectedWard} />
            
            {selectedWard && (
                <Modal isOpen={isDeleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Confirm Delete">
                    <div className="flex items-start">
                         <AlertTriangle className="h-6 w-6 text-yellow-400 mr-3 flex-shrink-0" />
                        <div>
                             <p className="text-gray-300">
                                Are you sure you want to delete the <span className="font-bold text-white">{selectedWard.name}</span>?
                            </p>
                            <p className="text-sm text-gray-400 mt-2">
                                This action is permanent and cannot be undone. You can only delete a ward if no patients are currently admitted to it.
                            </p>
                        </div>
                    </div>
                   
                    <div className="mt-6 flex justify-end space-x-4">
                        <button onClick={() => setDeleteModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
                        <button onClick={confirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700">Delete Ward</button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default WardManagement;
