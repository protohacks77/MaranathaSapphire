import { userSearchPrefixes } from '../../services/patientSearch';
import { invalidateReads } from '../../services/readCache';

import React, { useState, useEffect } from 'react';
import Modal from '../../components/utils/Modal';
import { useNotification } from '../../context/NotificationContext';
import { auth, db } from '../../services/firebase';
import { Role, Ward } from '../../types';
import { departmentRoles } from '../../constants';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserAdded: () => void;
}

const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, onUserAdded }) => {
  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    email: '',
    password: '',
    department: '',
    role: '',
    wardId: ''
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const { addNotification } = useNotification();

  useEffect(() => {
    if (formData.department) {
      setAvailableRoles(departmentRoles[formData.department] || []);
      setFormData(f => ({ ...f, role: '' })); // Reset role when department changes
    } else {
      setAvailableRoles([]);
    }
  }, [formData.department]);

  useEffect(() => {
    // Fetch wards if the selected role could be a nurse
    if (isOpen) {
        db.collection('wards').orderBy('name').get().then(snapshot => {
            setWards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ward)));
        });
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
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
      const userCredential = await auth.createUserWithEmailAndPassword(formData.email, formData.password);
      const user = userCredential.user;
      if (user) {
        const selectedWard = wards.find(w => w.id === formData.wardId);
        const userProfile: any = {
          searchPrefixes: userSearchPrefixes(formData.name, formData.surname, formData.email, formData.role, formData.department),
          name: formData.name,
          surname: formData.surname,
          email: formData.email,
          department: formData.department,
          role: formData.role as Role,
        };
        if (formData.role === Role.Nurse && selectedWard) {
            userProfile.wardId = selectedWard.id;
            userProfile.wardName = selectedWard.name;
        }
        await db.collection('users').doc(user.uid).set(userProfile);
        invalidateReads();
        addNotification('User added successfully!', 'success');
        setStatus('success');
        setTimeout(() => {
            onUserAdded();
            onClose();
            setStatus('idle');
        }, 1500);
      }
    } catch (error: any) {
      console.error("Error adding user:", error);
      addNotification(error.message || 'Failed to add user.', 'error');
      setStatus('idle');
    }
  };
  
  const getButtonText = () => {
      switch (status) {
          case 'loading': return 'Adding...';
          case 'success': return 'User Added!';
          default: return 'Add User';
      }
  };


  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New User">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input type="text" name="name" placeholder="First Name" value={formData.name} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white" />
          <input type="text" name="surname" placeholder="Last Name" value={formData.surname} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white" />
        </div>
        <input type="email" name="email" placeholder="Email" value={formData.email} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white" />
        <input type="password" name="password" placeholder="Password" value={formData.password} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white" />
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

export default AddUserModal;
