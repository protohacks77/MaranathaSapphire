import { searchPrefixes } from '../../services/patientSearch';
import { invalidateReads } from '../../services/readCache';
import React, { useState, useEffect } from 'react';
import Modal from '../../components/utils/Modal';
import { useNotification } from '../../context/NotificationContext';
import { db } from '../../services/firebase';
import { PriceListItem } from '../../types';
import firebase from 'firebase/compat/app';

interface EditPriceListItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: PriceListItem;
  onItemUpdated: () => void;
}

const departmentOptions = ["OPD", "Pharmacy", "Laboratory", "Radiology", "Wards", "Rehabilitation", "Doctors"];

const EditPriceListItemModal: React.FC<EditPriceListItemModalProps> = ({ isOpen, onClose, item, onItemUpdated }) => {
  const [formData, setFormData] = useState({ name: '', department: '', unitPrice: '' });
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name,
        department: item.department,
        unitPrice: item.unitPrice.toString(),
      });
    }
  }, [item]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(formData.unitPrice);
    if (isNaN(price) || price < 0) {
        invalidateReads();
      addNotification('Please enter a valid price.', 'warning');
        return;
    }
    setLoading(true);
    try {
      await db.collection('priceList').doc(item.id!).update({
        nameLower: formData.name.trim().toLowerCase(),
        searchPrefixes: searchPrefixes(formData.name, formData.department, ''),
        name: formData.name,
        department: formData.department,
        unitPrice: price,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      invalidateReads();
      addNotification('Item updated successfully!', 'success');
      onItemUpdated();
      onClose();
    } catch (error) {
      console.error("Error updating item:", error);
      invalidateReads();
      addNotification('Failed to update item.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${item.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="text" name="name" placeholder="Item Name" value={formData.name} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white" />
        <select name="department" value={formData.department} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white">
          <option value="">Select Department</option>
          {departmentOptions.map(dept => <option key={dept} value={dept}>{dept}</option>)}
        </select>
        <input type="number" name="unitPrice" placeholder="Unit Price ($)" value={formData.unitPrice} onChange={handleChange} required min="0" step="0.01" className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white" />
        <div className="flex justify-end space-x-4 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:bg-sky-800">
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditPriceListItemModal;