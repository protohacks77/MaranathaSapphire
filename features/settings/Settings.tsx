import { userSearchPrefixes } from '../../services/patientSearch';
import { invalidateReads } from '../../services/readCache';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { db, auth } from '../../services/firebase';
import { Role } from '../../types';
import firebase from 'firebase/compat/app';
import InventoryResetSection from './InventoryResetSection';

const Settings: React.FC = () => {
  const { userProfile, currentUser } = useAuth();
  const { addNotification } = useNotification();
  
  const [formData, setFormData] = useState({ name: '', surname: '', phone: '', address: '' });
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setFormData({
        name: userProfile.name || '',
        surname: userProfile.surname || '',
        phone: userProfile.phone || '',
        address: userProfile.address || ''
      });
    }
  }, [userProfile]);
  
  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      addNotification('You must be logged in to update your profile.', 'error');
      return;
    }
    setProfileLoading(true);
    try {
      const userDocRef = db.collection('users').doc(currentUser.uid);
      await userDocRef.update({ ...formData, searchPrefixes: userSearchPrefixes(formData.name, formData.surname, userProfile!.email, userProfile!.role, userProfile!.department) });
      invalidateReads();
      addNotification('Profile updated successfully!', 'success');
    } catch (error) {
      console.error("Error updating profile: ", error);
      addNotification('Failed to update profile.', 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  const calculatePasswordStrength = (password: string) => {
      let score = 0;
      if (!password) return 0;
      if (password.length > 6) score += 30;
      if (password.length > 10) score += 30;
      if (/[A-Z]/.test(password)) score += 15;
      if (/[0-9]/.test(password)) score += 15;
      if (/[^A-Za-z0-9]/.test(password)) score += 10;
      return Math.min(score, 100);
  };

  const passwordStrength = useMemo(() => calculatePasswordStrength(passwordData.newPassword), [passwordData.newPassword]);

  const getStrengthColor = (score: number) => {
      if (score < 40) return 'bg-red-500';
      if (score < 70) return 'bg-yellow-500';
      return 'bg-green-500';
  };

  const getStrengthText = (score: number) => {
      if (score < 40) return 'Weak';
      if (score < 70) return 'Good';
      return 'Strong';
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) {
      addNotification('You must be logged in.', 'error');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      addNotification('New passwords do not match.', 'warning');
      return;
    }
    if (passwordData.newPassword.length < 6) {
        addNotification('Password should be at least 6 characters long.', 'warning');
        return;
    }

    setPasswordLoading(true);
    try {
        const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email!, passwordData.currentPassword);
        await currentUser.reauthenticateWithCredential(credential);

        await currentUser.updatePassword(passwordData.newPassword);
        
        // Send notification to all admins
        const adminsSnapshot = await db.collection('users').where('role', '==', Role.Admin).get();
        if (!adminsSnapshot.empty) {
            const batch = db.batch();
            adminsSnapshot.forEach(adminDoc => {
                const notificationRef = db.collection('notifications').doc();
                batch.set(notificationRef, {
                    recipientId: adminDoc.id,
                    senderId: userProfile.id,
                    senderName: `${userProfile.name} ${userProfile.surname}`,
                    title: 'User Password Changed',
                    message: `User ${userProfile.name} ${userProfile.surname} (${userProfile.role}) has updated their password.`,
                    type: 'password_change',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    read: false,
                });
            });
            await batch.commit();
        }

        addNotification('Password updated successfully!', 'success');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });

    } catch (error: any) {
        console.error("Error updating password: ", error);
        let message = 'Failed to update password.';
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            message = 'Incorrect current password.';
        }
        addNotification(message, 'error');
    } finally {
        setPasswordLoading(false);
    }
  }

  if (!userProfile) {
    return <div className="text-white">Loading profile...</div>;
  }

  const inputStyles = "mt-1 block w-full rounded-md border-gray-600 bg-gray-800 text-white shadow-sm focus:border-sky-500 focus:ring-sky-500 px-4 py-3";

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-6">Settings</h1>
      
      {/* Profile Settings */}
      <div className="bg-[#161B22] border border-gray-700 p-8 rounded-lg shadow-md max-w-3xl mx-auto">
        <h2 className="text-xl font-semibold text-white mb-2">Update Your Profile</h2>
        <p className="text-sm text-gray-400 mb-6">This information can be seen by administrators.</p>
        <form onSubmit={handleProfileSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300">First Name</label>
              <input type="text" name="name" id="name" value={formData.name} onChange={handleProfileChange} className={inputStyles} />
            </div>
            <div>
              <label htmlFor="surname" className="block text-sm font-medium text-gray-300">Last Name</label>
              <input type="text" name="surname" id="surname" value={formData.surname} onChange={handleProfileChange} className={inputStyles} />
            </div>
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-300">Phone Number</label>
            <input type="tel" name="phone" id="phone" value={formData.phone} onChange={handleProfileChange} className={inputStyles} />
          </div>
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-300">Address</label>
            <textarea name="address" id="address" rows={3} value={formData.address} onChange={handleProfileChange} className={inputStyles as any}></textarea>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={profileLoading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-sky-500 disabled:bg-sky-800 disabled:cursor-not-allowed">
              {profileLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Password Settings */}
      <div className="bg-[#161B22] border border-gray-700 p-8 rounded-lg shadow-md max-w-3xl mx-auto mt-8">
        <h2 className="text-xl font-semibold text-white mb-2">Change Password</h2>
        <p className="text-sm text-gray-400 mb-6">Choose a strong password that you're not using anywhere else.</p>
        <form onSubmit={handlePasswordSubmit} className="space-y-6">
           <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-300">Current Password</label>
              <input type="password" name="currentPassword" id="currentPassword" value={passwordData.currentPassword} onChange={handlePasswordChange} required className={inputStyles} />
            </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300">New Password</label>
              <input type="password" name="newPassword" id="newPassword" value={passwordData.newPassword} onChange={handlePasswordChange} required className={inputStyles} />
              
              {/* Password Strength Indicator */}
              {passwordData.newPassword.length > 0 && (
                  <div className="mt-2">
                      <div className="flex justify-between items-center text-xs text-gray-400 mb-1">
                          <span>Strength</span>
                          <span className={passwordStrength < 40 ? 'text-red-400' : passwordStrength < 70 ? 'text-yellow-400' : 'text-green-400'}>
                              {getStrengthText(passwordStrength)}
                          </span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-1.5">
                          <div 
                              className={`h-1.5 rounded-full transition-all duration-300 ${getStrengthColor(passwordStrength)}`} 
                              style={{ width: `${passwordStrength}%` }}
                          ></div>
                      </div>
                  </div>
              )}
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300">Confirm New Password</label>
              <input type="password" name="confirmPassword" id="confirmPassword" value={passwordData.confirmPassword} onChange={handlePasswordChange} required className={inputStyles} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={passwordLoading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-sky-500 disabled:bg-sky-800 disabled:cursor-not-allowed">
              {passwordLoading ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
      {userProfile.role === Role.Admin && <InventoryResetSection />}
    </div>
  );
};

export default Settings;
