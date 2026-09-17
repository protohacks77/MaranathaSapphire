import { searchPrefixes } from '../../services/patientSearch';
import { invalidateReads } from '../../services/readCache';

import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../../components/utils/Modal';
import { useNotification } from '../../context/NotificationContext';
import { db } from '../../services/firebase';
import { InventoryItem, Role, PriceListItem, InventoryLog } from '../../types';
import { useAuth } from '../../context/AuthContext';
import firebase from 'firebase/compat/app';
import { Pill, AlertTriangle, Calculator, ArrowRight, Package } from 'lucide-react';

interface AddEditInventoryItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  item?: InventoryItem | null;
}

const AddEditInventoryItemModal: React.FC<AddEditInventoryItemModalProps> = ({ isOpen, onClose, onSuccess, item }) => {
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    unitPrice: '',
    lowStockThreshold: '',
    supplier: '',
  });
  
  // Stock Logic State
  const [stockToAdd, setStockToAdd] = useState(''); // Input for Quantity to Add
  
  // Pills Logic State
  const [isPill, setIsPill] = useState(false);
  const [bigBoxes, setBigBoxes] = useState('');
  const [smallBoxesPerBigBox, setSmallBoxesPerBigBox] = useState('');
  const PILLS_PER_SMALL_BOX = 1000;

  // Suggestion State
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();
  const { userProfile } = useAuth();

  const canEditPrice = useMemo(() => {
      return userProfile?.role === Role.Accountant || userProfile?.role === Role.Admin;
  }, [userProfile]);

  const canManageStock = [Role.Accountant, Role.Pharmacist, Role.PharmacyTechnician, Role.DispensaryAssistant, Role.Admin].includes(userProfile?.role as Role);

  // Check for existing item on name change
  useEffect(() => {
      if (!formData.name || item) return; // Don't check if editing or empty
      
      const checkExists = async () => {
          const snapshot = await db.collection('inventory').where('name', '==', formData.name).limit(1).get();
          if (!snapshot.empty) {
              setSuggestion(`Item "${formData.name}" already exists. consider editing it instead.`);
          } else {
              setSuggestion(null);
          }
      };
      
      const timer = setTimeout(checkExists, 500); // Debounce
      return () => clearTimeout(timer);
  }, [formData.name, item]);

  // Automatically calculate stockToAdd when box inputs change (Pills logic)
  useEffect(() => {
      if (isPill) {
          const big = parseInt(bigBoxes) || 0;
          const small = parseInt(smallBoxesPerBigBox) || 0;
          const total = big * small * PILLS_PER_SMALL_BOX;
          setStockToAdd(total > 0 ? total.toString() : '');
      }
  }, [isPill, bigBoxes, smallBoxesPerBigBox]);

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name,
        category: item.category,
        unitPrice: item.unitPrice.toString(),
        lowStockThreshold: item.lowStockThreshold.toString(),
        supplier: item.supplier || '',
      });
      setStockToAdd(''); // Reset added stock when opening edit
      setIsPill(false); 
      setBigBoxes('');
      setSmallBoxesPerBigBox('');
    } else {
      setFormData({
        name: '',
        category: '',
        unitPrice: '',
        lowStockThreshold: '10',
        supplier: '',
      });
      setStockToAdd(''); // Reset added stock for new item
      setIsPill(false);
      setBigBoxes('');
      setSmallBoxesPerBigBox('');
    }
    setSuggestion(null);
  }, [item, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  
  // Calculation Logic
  const currentQty = item ? item.quantity : 0;
  const addedQty = parseInt(stockToAdd) || 0;
  const newTotalQty = currentQty + addedQty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !canManageStock || loading) return;

    const unitPrice = parseFloat(formData.unitPrice);
    const lowStockThreshold = parseInt(formData.lowStockThreshold);

    if (!Number.isSafeInteger(Number(stockToAdd || 0)) || Number(stockToAdd || 0) < 0 || (!item && Number(stockToAdd || 0) <= 0)) {
      addNotification('Enter a positive whole-number stock quantity.', 'warning');
      return;
    }
    if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0 || Number(formData.lowStockThreshold) !== lowStockThreshold) {
      addNotification('Enter a valid whole-number low stock threshold.', 'warning');
      return;
    }
    if (newTotalQty < 0) {
      addNotification('Total quantity cannot be negative.', 'warning');
      return;
    }
    if (isNaN(unitPrice) || unitPrice < 0) {
      addNotification('Please enter a valid unit price.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const inventoryRef = item ? db.collection('inventory').doc(item.id!) : db.collection('inventory').doc();
      const logRef = db.collection('inventoryLogs').doc();
      const priceListQuery = await db.collection('priceList').where('name', '==', formData.name).limit(1).get();
      const priceRef = priceListQuery.empty ? db.collection('priceList').doc() : priceListQuery.docs[0].ref;
      await db.runTransaction(async transaction => {
          const existing = item ? await transaction.get(inventoryRef) : null;
          if (item && !existing?.exists) throw new Error('This inventory item no longer exists.');
          const current = existing?.data();
          const previousQuantity = current?.quantity ?? 0;
          if (!Number.isSafeInteger(previousQuantity) || previousQuantity < 0) throw new Error('Current stock is invalid.');
          const newQuantity = previousQuantity + addedQty;
          if (!Number.isSafeInteger(newQuantity)) throw new Error('Stock quantity is too large.');
          const savedPrice = item && !canEditPrice ? current!.unitPrice : unitPrice;
          const timestamp = firebase.firestore.FieldValue.serverTimestamp();
          const inventoryData = {
              searchPrefixes: searchPrefixes(formData.name, formData.category, ''),
              nameLower: formData.name.trim().toLowerCase(),
              name: formData.name.trim(), category: formData.category.trim(), quantity: newQuantity,
              unitPrice: savedPrice, stockValue: newQuantity * savedPrice, lowStockThreshold, isLowStock: newQuantity <= lowStockThreshold, supplier: formData.supplier.trim(), updatedAt: timestamp,
              totalStockReceived: (current?.totalStockReceived ?? previousQuantity) + addedQty,
          };
          if (item) transaction.update(inventoryRef, inventoryData);
          else transaction.set(inventoryRef, { ...inventoryData, createdAt: timestamp });
          if (addedQty > 0 || !item) transaction.set(logRef, {
              itemId: inventoryRef.id, itemName: inventoryData.name, type: 'Restock', changeAmount: addedQty,
              previousQuantity, newQuantity, userId: userProfile.id,
              userName: `${userProfile.name} ${userProfile.surname}`, timestamp,
              notes: item ? 'Stock Added' : 'New Item Added',
          });
          if (!item || canEditPrice) {
              if (priceListQuery.empty) transaction.set(priceRef, {
                  name: inventoryData.name, nameLower: inventoryData.name.toLowerCase(), searchPrefixes: searchPrefixes(inventoryData.name, 'Pharmacy', ''), department: 'Pharmacy', unitPrice: savedPrice,
                  createdAt: timestamp, updatedAt: timestamp,
              });
              else transaction.update(priceRef, { nameLower: inventoryData.name.toLowerCase(), searchPrefixes: searchPrefixes(inventoryData.name, 'Pharmacy', ''), unitPrice: savedPrice, updatedAt: timestamp });
          }
      });

      invalidateReads();
      addNotification(`Item saved successfully!`, 'success');
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error saving inventory item:", error);
      addNotification(error instanceof Error ? error.message : 'Failed to save item.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white modern-input disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item ? 'Edit Stock & Restock' : 'Add New Inventory Item'} size="lg">
      <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <form onSubmit={handleSubmit} className="space-y-4">
                {suggestion && (
                    <div className="bg-yellow-900/30 border border-yellow-600 p-3 rounded-md flex items-start gap-2 text-yellow-200 text-sm mb-4">
                        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                        <p>{suggestion}</p>
                    </div>
                )}

                <input type="text" name="name" placeholder="Item Name" value={formData.name} onChange={handleChange} required className={inputClass} />
                <input type="text" name="category" placeholder="Category (e.g., Antibiotic)" value={formData.category} onChange={handleChange} required className={inputClass} />
                
                {/* Packaging Logic */}
                <div className="bg-gray-800/50 p-3 rounded-md border border-gray-700">
                    <div className="flex items-center mb-3">
                        <input 
                            type="checkbox" 
                            id="isPill" 
                            checked={isPill} 
                            onChange={(e) => setIsPill(e.target.checked)} 
                            className="mr-2 h-4 w-4 text-sky-600 rounded"
                        />
                        <label htmlFor="isPill" className="text-sm text-gray-300 flex items-center gap-1 cursor-pointer select-none">
                            <Pill size={14}/> Is this Pills/Tablets? (Auto-calculate added qty)
                        </label>
                    </div>
                    
                    {isPill && (
                        <div className="grid grid-cols-2 gap-3 mb-2 animate-slide-in-top">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Big Boxes Added</label>
                                <input type="number" value={bigBoxes} onChange={(e) => setBigBoxes(e.target.value)} min="0" className={inputClass} placeholder="0" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Small Boxes / Big Box</label>
                                <input type="number" value={smallBoxesPerBigBox} onChange={(e) => setSmallBoxesPerBigBox(e.target.value)} min="0" className={inputClass} placeholder="0" />
                                <p className="text-[10px] text-gray-500 mt-1">* 1000 pills/small box</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                    <div>
                        <label className="block text-sm font-semibold text-gray-400 mb-1 flex items-center gap-1">
                            <Package size={14} /> Current Stock
                        </label>
                        <div className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-400 font-mono">
                            {currentQty.toLocaleString()}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-sky-400 mb-1 flex items-center gap-1">
                            <ArrowRight size={14} /> {item ? 'Quantity Adding' : 'Initial Quantity'}
                        </label>
                        <input 
                            type="number" 
                            placeholder="0" 
                            value={stockToAdd} 
                            onChange={(e) => setStockToAdd(e.target.value)} 
                            className={`${inputClass} border-sky-500/50 focus:border-sky-500 bg-sky-900/10 text-white font-bold`} 
                            readOnly={isPill}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Unit Price ($)</label>
                        <input 
                            type="number" 
                            name="unitPrice" 
                            value={formData.unitPrice} 
                            onChange={handleChange} 
                            required 
                            min="0" 
                            step="0.01" 
                            className={inputClass} 
                            disabled={Boolean(item) && !canEditPrice}
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Low Stock Threshold</label>
                        <input type="number" name="lowStockThreshold" placeholder="Alert At" value={formData.lowStockThreshold} onChange={handleChange} required min="0" className={inputClass} />
                    </div>
                </div>
                <input type="text" name="supplier" placeholder="Supplier (Optional)" value={formData.supplier} onChange={handleChange} className={inputClass} />

                <div className="flex justify-end space-x-4 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
                    <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:bg-sky-800">
                        {loading ? 'Saving...' : 'Save Inventory'}
                    </button>
                </div>
            </form>
          </div>

          {/* Sidebar Calculator */}
          <div className="w-full md:w-1/3 bg-gray-800 p-4 rounded-lg border border-gray-700 h-fit">
              <h4 className="text-sky-400 font-semibold mb-4 flex items-center gap-2"><Calculator size={16}/> Stock Projection</h4>
              <div className="space-y-4 text-sm">
                  <div className="flex justify-between text-gray-400">
                      <span>Current:</span>
                      <span className="text-white font-mono">{currentQty.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                      <span>Adding:</span>
                      <span className={`font-mono ${addedQty >= 0 ? 'text-green-400' : 'text-red-400'}`}>{addedQty > 0 ? '+' : ''}{addedQty.toLocaleString()}</span>
                  </div>
                  <div className="h-px bg-gray-600 my-2"></div>
                  <div className="flex justify-between font-bold text-white text-lg">
                      <span>New Total:</span>
                      <span>{newTotalQty.toLocaleString()}</span>
                  </div>
                  {addedQty > 0 && (
                      <div className="mt-4 p-3 bg-green-900/20 border border-green-800 rounded text-xs text-green-300">
                          Adding {addedQty.toLocaleString()} units to inventory.
                      </div>
                  )}
                  {addedQty < 0 && (
                      <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded text-xs text-red-300">
                          Removing {Math.abs(addedQty).toLocaleString()} units from inventory.
                      </div>
                  )}
              </div>
          </div>
      </div>
    </Modal>
  );
};

export default AddEditInventoryItemModal;
