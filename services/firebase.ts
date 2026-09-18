import { withOfflineSupport, restorePendingSaves } from './offlineFirestore';
import { updateOfflineStatus } from './offlineStatus';

import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";

// Firebase project configuration.
const firebaseConfig = {
  apiKey: "AIzaSyB42pyR9igEAm0eiUL_f8luGik9rSjHbLE",
  authDomain: "maranathasapphire.firebaseapp.com",
  projectId: "maranathasapphire",
  storageBucket: "maranathasapphire.firebasestorage.app",
  messagingSenderId: "742888367455",
  appId: "1:742888367455:web:8ac84a02d11409650882ea"
};
// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
const firestore = firebase.firestore();
firestore.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
export const persistenceReady: Promise<boolean> = typeof window === 'undefined'
  ? Promise.resolve(false)
  : firestore.enablePersistence({ synchronizeTabs: true }).then(() => {
      updateOfflineStatus({ persistence: 'ready' });
      return true;
    }).catch((error: any) => {
      updateOfflineStatus({ persistence: 'unavailable' });
      console.warn('Offline persistence unavailable:', error.code);
      return false;
    });
export const db = withOfflineSupport(firestore, persistenceReady);
export const restoreOfflineSaves = () => restorePendingSaves(firestore);
if (typeof window !== 'undefined') {
  const connectivity = () => {
    updateOfflineStatus({ online: navigator.onLine });
    void (navigator.onLine ? firestore.enableNetwork() : firestore.disableNetwork()).catch(() => {});
  };
  window.addEventListener('online', connectivity);
  window.addEventListener('offline', connectivity);
  if (!navigator.onLine) void persistenceReady.then(connectivity);
  // Ask the browser to retain offline records instead of evicting them under pressure.
  void navigator.storage?.persist?.().catch(() => {});
}
