import { usePagedQuery } from '../../services/usePagedQuery';
import LoadMore from '../../components/utils/LoadMore';
import { cachedRead } from '../../services/readCache';
import firebase from 'firebase/compat/app';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { db } from '../../services/firebase';
import { PriceListItem, InventoryItem } from '../../types';
import LoadingSpinner from '../../components/utils/LoadingSpinner';
import { Edit, Plus, Search, Trash2, Building, LayoutGrid, Table as TableIcon, AlertTriangle } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import AddPriceListItemModal from './AddPriceListItemModal';
import EditPriceListItemModal from './EditPriceListItemModal';
import Modal from '../../components/utils/Modal';

const PriceListManagement: React.FC = () => {
    const [inventoryMap, setInventoryMap] = useState<Map<string, InventoryItem>>(new Map());
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    
    const [isAddModalOpen, setAddModalOpen] = useState(false);
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<PriceListItem | null>(null);
    const { addNotification } = useNotification();

    const [searchTerm, setSearchTerm] = useState('');
    useEffect(() => { const timer = setTimeout(() => setSearchTerm(searchQuery.trim().toLowerCase()), 300); return () => clearTimeout(timer); }, [searchQuery]);
    const priceQuery = useMemo(() => {
        let query: firebase.firestore.Query = db.collection('priceList');
        if (searchTerm.length >= 2) query = query.where('searchPrefixes', 'array-contains', searchTerm);
        return query.orderBy('name');
    }, [searchTerm]);
    const { records: items, loading, loadingMore, hasMore, error, indexUrl, loadMore, refresh: fetchItems } = usePagedQuery<PriceListItem>(priceQuery, `prices:${searchTerm}`);
    useEffect(() => {
        let cancelled = false;
        Promise.all(items.filter(item => item.department === 'Pharmacy').map(item => cachedRead(`inventory-name:${item.name}`, () => db.collection('inventory').where('name', '==', item.name).limit(1).get())))
            .then(snapshots => { if (!cancelled) setInventoryMap(new Map(snapshots.flatMap(snapshot => snapshot.docs.map(doc => { const item = { ...doc.data(), id: doc.id } as InventoryItem; return [item.name, item] as const; })))); }).catch(console.error);
        return () => { cancelled = true; };
    }, [items]);
    const filteredItems = items;

    const handleEdit = (item: PriceListItem) => {
        setSelectedItem(item);
        setEditModalOpen(true);
    };

    const handleDelete = (item: PriceListItem) => {
        setSelectedItem(item);
        setDeleteModalOpen(true);
    }
    
    const confirmDelete = async () => {
        if (!selectedItem) return;
        try {
            await db.collection('priceList').doc(selectedItem.id!).delete();
            addNotification('Item deleted successfully.', 'success');
            setDeleteModalOpen(false);
            setSelectedItem(null);
            fetchItems(); // Refetch
        } catch (error) {
            addNotification('Failed to delete item.', 'error');
        }
    }

    if (loading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-white">Price List Management</h1>
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input type="text" placeholder="Search items..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    
                    {/* View Toggle */}
                    <div className="flex bg-[#161B22] border border-gray-700 rounded-lg p-1">
                        <button 
                            onClick={() => setViewMode('cards')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'cards' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            title="Card View"
                        >
                            <LayoutGrid size={18} />
                        </button>
                        <button 
                            onClick={() => setViewMode('table')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'table' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            title="Table View"
                        >
                            <TableIcon size={18} />
                        </button>
                    </div>

                    <button onClick={() => setAddModalOpen(true)} className="flex items-center justify-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 w-full sm:w-auto">
                        <Plus size={18} />
                        <span className="hidden sm:inline">Add Item</span>
                    </button>
                </div>
            </div>

            {viewMode === 'cards' ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredItems.map(item => {
                        const linkedInventory = inventoryMap.get(item.name);
                        const isLowStock = linkedInventory ? linkedInventory.quantity <= linkedInventory.lowStockThreshold : false;

                        return (
                            <div key={item.id} className={`border rounded-lg shadow-md flex flex-col justify-between p-6 transition-all group ${isLowStock ? 'bg-red-900/10 border-red-900/50 hover:shadow-red-900/20' : 'bg-[#161B22] border-gray-700 hover:shadow-sky-500/20 hover:border-sky-700'}`}>
                                <div>
                                    <h3 className="text-lg font-semibold text-white truncate group-hover:text-sky-400 transition-colors">
                                        {item.name}
                                        {isLowStock && <AlertTriangle size={16} className="inline ml-2 text-red-400" aria-label="Low Stock" />}
                                    </h3>
                                    <p className="flex items-center text-sm text-gray-400 mt-2"><Building size={14} className="mr-2 text-gray-500" />{item.department}</p>
                                    <p className="text-2xl font-bold text-sky-400 mt-4">${item.unitPrice.toFixed(2)}</p>
                                    {isLowStock && linkedInventory && (
                                        <p className="text-xs text-red-400 mt-2 font-semibold">Only {linkedInventory.quantity} left in stock</p>
                                    )}
                                </div>
                                <div className="flex items-center justify-end space-x-2 mt-6 pt-4 border-t border-gray-700">
                                    <button onClick={() => handleEdit(item)} className="p-2 text-gray-400 hover:text-sky-500 bg-gray-800/50 hover:bg-sky-900/20 rounded-md transition-colors" aria-label={`Edit ${item.name}`}><Edit size={18} /></button>
                                    <button onClick={() => handleDelete(item)} className="p-2 text-gray-400 hover:text-red-500 bg-gray-800/50 hover:bg-red-900/20 rounded-md transition-colors" aria-label={`Delete ${item.name}`}><Trash2 size={18} /></button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-[#161B22] border border-gray-700 rounded-lg shadow-md overflow-hidden animate-slide-in-top">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 border-b border-gray-700">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Item Name</th>
                                    <th className="px-6 py-4 font-medium">Department</th>
                                    <th className="px-6 py-4 font-medium text-right">Unit Price ($)</th>
                                    <th className="px-6 py-4 font-medium text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {filteredItems.map((item) => {
                                    const linkedInventory = inventoryMap.get(item.name);
                                    const isLowStock = linkedInventory ? linkedInventory.quantity <= linkedInventory.lowStockThreshold : false;

                                    return (
                                        <tr key={item.id} className={`transition-colors ${isLowStock ? 'bg-red-900/10 hover:bg-red-900/20 border-b border-red-900/30' : 'hover:bg-gray-800/30 border-b border-gray-700'}`}>
                                            <td className="px-6 py-4 font-medium text-white">
                                                {item.name}
                                                {isLowStock && (
                                                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-900/20 px-2 py-0.5 rounded-full" title={`Low Stock: ${linkedInventory?.quantity} remaining`}>
                                                        <AlertTriangle size={10} /> LOW STOCK
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-gray-300">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-800 border border-gray-600 text-gray-300">
                                                    {item.department}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-sky-400">
                                                ${item.unitPrice.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => handleEdit(item)} className="p-1.5 text-gray-400 hover:text-sky-500 transition-colors" title="Edit"><Edit size={16} /></button>
                                                    <button onClick={() => handleDelete(item)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {filteredItems.length === 0 && (
                        <div className="text-center py-12">
                            <p className="text-gray-500">No items found matching your search.</p>
                        </div>
                    )}
                </div>
            )}
            
            <AddPriceListItemModal isOpen={isAddModalOpen} onClose={() => setAddModalOpen(false)} onItemAdded={fetchItems} />
            {selectedItem && <EditPriceListItemModal isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} item={selectedItem} onItemUpdated={fetchItems} />}
            {selectedItem && (
                <Modal isOpen={isDeleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Confirm Delete">
                    <p className="text-gray-400">Are you sure you want to delete <span className="font-bold text-white">{selectedItem.name}</span>? This action is permanent.</p>
                    <div className="mt-6 flex justify-end space-x-4">
                        <button onClick={() => setDeleteModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
                        <button onClick={confirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700">Delete</button>
                    </div>
                </Modal>
            )}
            <LoadMore hasMore={hasMore} loading={loadingMore} error={error} indexUrl={indexUrl} onLoad={loadMore} onRetry={fetchItems} />
        </div>
    );
};

export default PriceListManagement;
