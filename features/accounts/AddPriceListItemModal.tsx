import { searchPrefixes } from '../../services/patientSearch';
import { invalidateReads } from '../../services/readCache';
import React, { useState } from 'react';
import Modal from '../../components/utils/Modal';
import { useNotification } from '../../context/NotificationContext';
import { db } from '../../services/firebase';
import firebase from 'firebase/compat/app';

interface AddPriceListItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemAdded: () => void;
}

const departmentOptions = ["OPD", "Pharmacy", "Laboratory", "Radiology", "Wards", "Rehabilitation", "Doctors"];

const AddPriceListItemModal: React.FC<AddPriceListItemModalProps> = ({ isOpen, onClose, onItemAdded }) => {
  const [formData, setFormData] = useState({ name: '', department: '', unitPrice: '' });
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();

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
      await db.collection('priceList').add({
        nameLower: formData.name.trim().toLowerCase(),
        searchPrefixes: searchPrefixes(formData.name, formData.department, ''),
        name: formData.name,
        department: formData.department,
        unitPrice: price,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      invalidateReads();
      addNotification('Price list item added successfully!', 'success');
      onItemAdded();
      onClose();
    } catch (error) {
      console.error("Error adding price list item:", error);
      invalidateReads();
      addNotification('Failed to add item.', 'error');
    } finally {
      setLoading(false);
      setFormData({ name: '', department: '', unitPrice: '' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Service/Product">
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="text" name="name" placeholder="Item Name / Description" value={formData.name} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white" />
        <select name="department" value={formData.department} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white">
          <option value="">Select Department</option>
          {departmentOptions.map(dept => <option key={dept} value={dept}>{dept}</option>)}
        </select>
        <input type="number" name="unitPrice" placeholder="Unit Price ($)" value={formData.unitPrice} onChange={handleChange} required min="0" step="0.01" className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white" />
        <div className="flex justify-end space-x-4 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:bg-sky-800">
            {loading ? 'Adding...' : 'Add Item'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AddPriceListItemModal;