import { invalidateReads } from '../services/readCache';
import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { auth, db } from '../services/firebase';
import { UserProfile } from '../types';
import LoadingSpinner from '../components/utils/LoadingSpinner';

interface AuthContextType {
  currentUser: firebase.User | null;
  userProfile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ currentUser: null, userProfile: null, loading: true });

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<firebase.User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const authTimeout = setTimeout(() => {
        if (loading) {
            console.warn("Authentication check timed out. This may be due to network issues or incorrect Firebase configuration. The app will proceed in an offline state.");
            setLoading(false);
        }
    }, 10000); // 10-second timeout

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      clearTimeout(authTimeout);
      invalidateReads();
      setCurrentUser(user);
      if (user) {
        const userDocRef = db.collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();
        if (userDoc.exists) {
          setUserProfile({ id: user.uid, ...userDoc.data() } as UserProfile);
        } else {
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => {
        unsubscribe();
        clearTimeout(authTimeout);
    };
  }, []);

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  const value = {
    currentUser,
    userProfile,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};