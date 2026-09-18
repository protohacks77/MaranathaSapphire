import { usePagedQuery } from '../../services/usePagedQuery';
import LoadMore from '../../components/utils/LoadMore';
import firebase from 'firebase/compat/app';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { db } from '../../services/firebase';
import { InventoryItem, Role, InventoryLog, BillItem, Bill } from '../../types';
import PageSkeleton, { ModalSkeleton } from '../../components/utils/SkeletonLoader';
import { Edit, Plus, Search, Trash2, Pill, AlertTriangle, Package, DollarSign, History, BarChart, X } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import Modal from '../../components/utils/Modal';
import AddEditInventoryItemModal from './AddEditInventoryItemModal';
import DispenseMedicationModal from './DispenseMedicationModal';
import { useAuth } from '../../context/AuthContext';

const StockHistoryModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<'logs' | 'billed'>('logs');
    const historyQuery = useMemo(() => activeTab === 'logs'
        ? db.collection('inventoryLogs').orderBy('timestamp', 'desc')
        : db.collection('bills').orderBy('date', 'desc'), [activeTab]);
    const { records, loading, loadingMore, hasMore, error, indexUrl, loadMore, refresh } = usePagedQuery<any>(historyQuery, `stock-history:${activeTab}`, isOpen);
    const logs = records as InventoryLog[];
    const billedItems = activeTab === 'billed' ? (records as Bill[]).flatMap(bill => bill.items
        .filter(item => item.inventoryItemId || item.department === 'Pharmacy')
        .map(item => ({ id: `${bill.id}-${item.id}`, name: item.description, quantity: item.quantity,
            date: new Date(bill.date), amount: item.totalPrice }))) : [];

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Stock History & Activity" size="xl">
            <div className="mb-4 flex space-x-2 border-b border-gray-700">
                <button onClick={() => setActiveTab('logs')} className={`px-4 py-2 ${activeTab === 'logs' ? 'border-b-2 border-sky-500 text-white' : 'text-gray-400'}`}>Stock Activity</button>
                <button onClick={() => setActiveTab('billed')} className={`px-4 py-2 ${activeTab === 'billed' ? 'border-b-2 border-sky-500 text-white' : 'text-gray-400'}`}>Billed Items</button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                {loading ? <ModalSkeleton items={5} /> : (
                    activeTab === 'logs' ? (
                        <table className="w-full text-sm text-left text-gray-400">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-700 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Item</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3 text-right">Change</th>
                                    <th className="px-4 py-3 text-right">New Qty</th>
                                    <th className="px-4 py-3">Recipient</th>
                                    <th className="px-4 py-3">User</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log.id} className="border-b border-gray-700 bg-gray-800/50">
                                        <td className="px-4 py-2">{log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'N/A'}</td>
                                        <td className="px-4 py-2 text-white font-medium">{log.itemName}</td>
                                        <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-xs ${log.type === 'Restock' ? 'bg-green-900 text-green-300' : log.type === 'Sale' ? 'bg-blue-900 text-blue-300' : 'bg-yellow-900 text-yellow-300'}`}>{log.type}</span></td>
                                        <td className={`px-4 py-2 text-right font-mono ${log.changeAmount > 0 ? 'text-green-400' : 'text-red-400'}`}>{log.changeAmount > 0 ? '+' : ''}{log.changeAmount}</td>
                                        <td className="px-4 py-2 text-right font-mono text-white">{log.newQuantity}</td>
                                        <td className="px-4 py-2"><p>{log.recipientName || '—'}</p>{log.recipientHospitalNumber && <p className="text-xs text-gray-500">{log.recipientHospitalNumber}</p>}</td>
                                        <td className="px-4 py-2">{log.userName}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full text-sm text-left text-gray-400">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-700 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Item Name</th>
                                    <th className="px-4 py-3 text-center">Qty Sold</th>
                                    <th className="px-4 py-3 text-right">Total ($)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {billedItems.map((item, idx) => (
                                    <tr key={idx} className="border-b border-gray-700 bg-gray-800/50">
                                        <td className="px-4 py-2">{item.date.toLocaleString()}</td>
                                        <td className="px-4 py-2 text-white font-medium">{item.name}</td>
                                        <td className="px-4 py-2 text-center text-white">{item.quantity}</td>
                                        <td className="px-4 py-2 text-right text-green-400">${item.amount.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                )}
            </div>
            <LoadMore hasMore={hasMore} loading={loadingMore} error={error} indexUrl={indexUrl} onLoad={loadMore} onRetry={refresh} />
        </Modal>
    );
}

const InventoryManagement: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    
    const [isAddEditModalOpen, setAddEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
    const [isHistoryModalOpen, setHistoryModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const { addNotification } = useNotification();
    const { userProfile } = useAuth();

    const canModify = useMemo(() => {
        return [Role.Accountant, Role.Pharmacist, Role.PharmacyTechnician, Role.DispensaryAssistant, Role.Admin].includes(userProfile?.role || '' as Role);
    }, [userProfile]);

    const canDispense = [Role.Pharmacist, Role.PharmacyTechnician, Role.DispensaryAssistant, Role.Admin].includes(userProfile?.role as Role);
    const [dispensingItem, setDispensingItem] = useState<InventoryItem | null>(null);

    const canDelete = useMemo(() => userProfile?.role === Role.Accountant || userProfile?.role === Role.Admin, [userProfile]);

    const [searchTerm, setSearchTerm] = useState('');
    useEffect(() => { const timer = setTimeout(() => setSearchTerm(searchQuery.trim().toLowerCase()), 300); return () => clearTimeout(timer); }, [searchQuery]);
    const inventoryQuery = useMemo(() => {
        let query: firebase.firestore.Query = db.collection('inventory');
        if (searchTerm.length >= 2) query = query.where('searchPrefixes', 'array-contains', searchTerm);
        return query.orderBy('name');
    }, [searchTerm]);
    const { records: items, loading, loadingMore, hasMore, error, indexUrl, loadMore, refresh: fetchItems } = usePagedQuery<InventoryItem>(inventoryQuery, `inventory:${searchTerm}`);

    const filteredItems = useMemo(() => {
        if (!searchQuery) return items;
        const lowercasedQuery = searchQuery.toLowerCase();
        return items.filter(item =>
            item.name.toLowerCase().includes(lowercasedQuery) ||
            item.category.toLowerCase().includes(lowercasedQuery)
        );
    }, [searchQuery, items]);

    const handleAdd = () => {
        setSelectedItem(null);
        setAddEditModalOpen(true);
    };

    const handleEdit = (item: InventoryItem) => {
        setSelectedItem(item);
        setAddEditModalOpen(true);
    };

    const handleDelete = (item: InventoryItem) => {
        setSelectedItem(item);
        setDeleteModalOpen(true);
    }
    
    const confirmDelete = async () => {
        if (!selectedItem) return;
        try {
            await db.collection('inventory').doc(selectedItem.id!).delete();
            addNotification('Item deleted successfully.', 'success');
            setDeleteModalOpen(false);
            setSelectedItem(null);
            fetchItems();
        } catch (error) {
            addNotification('Failed to delete item.', 'error');
        }
    }

    if (loading && !items.length) return <PageSkeleton type="table" />;

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-white">Pharmacy Inventory</h1>
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <button onClick={() => setHistoryModalOpen(true)} className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500">
                        <History size={18} />
                        <span className="hidden sm:inline">Stock History</span>
                    </button>
                    {canModify && (
                        <button onClick={handleAdd} className="flex items-center justify-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500">
                            <Plus size={18} />
                            <span>Add Stock</span>
                        </button>
                    )}
                </div>
            </div>
            
            <div className="mb-6 max-w-md">
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input type="text" placeholder="Search items..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                </div>
            </div>

            <div className="bg-[#161B22] border border-gray-700 rounded-lg shadow-md overflow-x-auto mb-6">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-800 border-b border-gray-700">
                        <tr>
                            <th className="px-6 py-3">Item Name</th>
                            <th className="px-6 py-3">Category</th>
                            <th className="px-6 py-3 text-center">Stock In (Total)</th>
                            <th className="px-6 py-3 text-center">Current Stock</th>
                            <th className="px-6 py-3 text-center">Unit Price</th>
                            <th className="px-6 py-3 text-center">Stock Value</th>
                            <th className="px-6 py-3 text-center">Last Updated</th>
                            <th className="px-6 py-3 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.map((item) => {
                            const isLowStock = item.quantity <= item.lowStockThreshold;
                            const stockValue = item.quantity * item.unitPrice;
                            const lastUpdated = item.updatedAt?.toDate ? item.updatedAt.toDate().toLocaleString() : 'N/A';
                            
                            return (
                                <tr key={item.id} className={`border-b border-gray-700 transition-colors ${isLowStock ? 'bg-red-900/10 hover:bg-red-900/20' : 'hover:bg-gray-800'}`}>
                                    <td className="px-6 py-4 font-medium text-white">
                                        {item.name}
                                        {isLowStock && (
                                            <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-900/20 px-2 py-0.5 rounded-full">
                                                <AlertTriangle size={10} /> LOW
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4"><Pill size={14} className="inline mr-1 text-sky-400"/> {item.category}</td>
                                    <td className="px-6 py-4 text-center text-gray-300">
                                        {item.totalStockReceived ? item.totalStockReceived.toLocaleString() : '-'}
                                    </td>
                                    <td className={`px-6 py-4 text-center font-bold ${isLowStock ? 'text-red-400' : 'text-white'}`}>
                                        {item.quantity.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-center text-gray-300">${item.unitPrice.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-center font-medium text-green-400">${stockValue.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-center text-xs text-gray-400">{lastUpdated}</td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex justify-center items-center gap-2">
                                            {canDispense && <button onClick={() => setDispensingItem(item)} disabled={item.quantity <= 0} className="inline-flex items-center gap-2 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed"><Pill size={14} /> Dispense</button>}
                                            {canModify && (
                                                <button onClick={() => handleEdit(item)} className="p-1.5 text-sky-500 hover:bg-sky-900/30 rounded transition-colors" title="Edit">
                                                    <Edit size={16} />
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button onClick={() => handleDelete(item)} className="p-1.5 text-red-500 hover:bg-red-900/30 rounded transition-colors" title="Delete">
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            
            <LoadMore hasMore={hasMore} loading={loadingMore} error={error} indexUrl={indexUrl} onLoad={loadMore} onRetry={fetchItems} />
            {canModify && <AddEditInventoryItemModal 
                isOpen={isAddEditModalOpen} 
                onClose={() => setAddEditModalOpen(false)} 
                onSuccess={fetchItems} 
                item={selectedItem} 
            />}
            
            {canDispense && dispensingItem && <DispenseMedicationModal item={dispensingItem} onClose={() => setDispensingItem(null)} onSuccess={fetchItems} />}

            <StockHistoryModal isOpen={isHistoryModalOpen} onClose={() => setHistoryModalOpen(false)} />

            {selectedItem && canDelete && (
                <Modal isOpen={isDeleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Confirm Delete">
                    <p className="text-gray-400">Are you sure you want to delete <span className="font-bold text-white">{selectedItem.name}</span>? This action is permanent.</p>
                    <div className="mt-6 flex justify-end space-x-4">
                        <button onClick={() => setDeleteModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
                        <button onClick={confirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700">Delete</button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default InventoryManagement;
