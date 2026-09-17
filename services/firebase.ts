
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
export const db = firebase.firestore();

// The compat SDK uses enablePersistence; modular localCache settings are not supported here.
if (typeof window !== 'undefined') {
  db.enablePersistence({ synchronizeTabs: true }).catch((error: any) => {
    if (!['failed-precondition', 'unimplemented'].includes(error.code)) console.warn('Offline persistence unavailable:', error.code);
  });
}
