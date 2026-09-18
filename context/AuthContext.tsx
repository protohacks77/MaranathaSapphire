import { invalidateReads } from '../services/readCache';
import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { setCacheUser } from '../services/deviceCache';
import { auth, db, restoreOfflineSaves } from '../services/firebase';
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

    let stopProfile: (() => void) | undefined;
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      clearTimeout(authTimeout);
      stopProfile?.();
      setLoading(true);
      invalidateReads();
      setCacheUser(user?.uid || null);
      setCurrentUser(user);
      setUserProfile(null);
      await restoreOfflineSaves();
      try {
        if (user) {
          const userDocRef = db.collection('users').doc(user.uid);
          let userDoc;
          try { userDoc = await userDocRef.get({ source: 'cache' }); } catch { /* First login needs the server. */ }
          if (!userDoc?.exists) userDoc = await userDocRef.get();
          if (userDoc.exists && auth.currentUser?.uid === user.uid) {
            setUserProfile({ id: user.uid, ...userDoc.data() } as UserProfile);
          }
          if (auth.currentUser?.uid === user.uid) stopProfile = userDocRef.onSnapshot(snapshot => {
            if (auth.currentUser?.uid !== user.uid) return;
            if (snapshot.exists) setUserProfile({ id: user.uid, ...snapshot.data() } as UserProfile);
            else if (!snapshot.metadata.fromCache) setUserProfile(null);
          }, error => console.warn('Could not refresh user profile:', error));
        }
      } catch (error) { console.warn('Could not load user profile:', error); }
      setLoading(false);
    });

    return () => {
        unsubscribe();
        stopProfile?.();
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