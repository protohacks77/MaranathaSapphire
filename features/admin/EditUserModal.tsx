import { userSearchPrefixes } from '../../services/patientSearch';
import { invalidateReads } from '../../services/readCache';

import React, { useState, useEffect } from 'react';
import Modal from '../../components/utils/Modal';
import { useNotification } from '../../context/NotificationContext';
import { db } from '../../services/firebase';
import { Role, UserProfile, Ward } from '../../types';
import { departmentRoles } from '../../constants';
import firebase from 'firebase/compat/app';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onUserUpdated: () => void;
}

const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, onClose, user, onUserUpdated }) => {
  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    department: '',
    role: '',
    wardId: ''
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const { addNotification } = useNotification();

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name,
        surname: user.surname,
        department: user.department,
        role: user.role,
        wardId: user.wardId || ''
      });
    }
  }, [user]);
  
  useEffect(() => {
      if (isOpen) {
        db.collection('wards').orderBy('name').get().then(snapshot => {
            setWards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ward)));
        });
      }
  }, [isOpen]);

  useEffect(() => {
    if (formData.department) {
      setAvailableRoles(departmentRoles[formData.department] || []);
    } else {
      setAvailableRoles([]);
    }
  }, [formData.department]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setFormData(prev => {
          const newState = { ...prev, [name]: value };
          if (name === 'department' && value !== prev.department) {
              newState.role = '';
              newState.wardId = '';
          }
           if (name === 'role' && value !== Role.Nurse) {
              newState.wardId = '';
           }
          return newState;
      });
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
     if (!formData.role) {
        addNotification('Please select a role.', 'warning');
        return;
    }
    if (formData.role === Role.Nurse && !formData.wardId) {
        addNotification('Please assign a ward to the nurse.', 'warning');
        return;
    }
    setStatus('loading');
    try {
      const selectedWard = wards.find(w => w.id === formData.wardId);
      const userDocRef = db.collection('users').doc(user.id);
      
      const updateData: any = {
        searchPrefixes: userSearchPrefixes(formData.name, formData.surname, user.email, formData.role, formData.department),
        name: formData.name,
        surname: formData.surname,
        department: formData.department,
        role: formData.role,
        wardId: firebase.firestore.FieldValue.delete(),
        wardName: firebase.firestore.FieldValue.delete()
      };

      if (formData.role === Role.Nurse && selectedWard) {
          updateData.wardId = selectedWard.id;
          updateData.wardName = selectedWard.name;
      }
      
      await userDocRef.update(updateData);
      invalidateReads();
      addNotification('User updated successfully!', 'success');
      setStatus('success');
      setTimeout(() => {
        onUserUpdated();
        onClose();
        setStatus('idle');
      }, 1500);
    } catch (error) {
      console.error("Error updating user:", error);
      addNotification('Failed to update user.', 'error');
      setStatus('idle');
    }
  };

  const getButtonText = () => {
    switch (status) {
      case 'loading': return 'Saving...';
      case 'success': return 'Changes Saved!';
      default: return 'Save Changes';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${user.name} ${user.surname}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input type="text" name="name" placeholder="First Name" value={formData.name} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white" />
          <input type="text" name="surname" placeholder="Last Name" value={formData.surname} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white" />
        </div>
        <input type="email" name="email" placeholder="Email" value={user.email} disabled className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-900 text-gray-400 cursor-not-allowed" />
        <select name="department" value={formData.department} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white">
          <option value="">Select Department</option>
          {Object.keys(departmentRoles).map(dept => <option key={dept} value={dept}>{dept}</option>)}
        </select>
        <select name="role" value={formData.role} onChange={handleChange} required disabled={!formData.department} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white disabled:opacity-50">
          <option value="">Select Role</option>
          {availableRoles.map(role => <option key={role} value={role}>{role}</option>)}
        </select>
         {formData.role === Role.Nurse && (
            <select name="wardId" value={formData.wardId} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white">
                <option value="">Assign Ward</option>
                {wards.map(ward => <option key={ward.id} value={ward.id}>{ward.name}</option>)}
            </select>
        )}
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

export default EditUserModal;
