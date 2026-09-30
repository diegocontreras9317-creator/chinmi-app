import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import firebaseConfigData from '../firebase-applet-config.json';

const getEnvVar = (viteKey: string, nextKey: string, fallback: string) => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[viteKey]) {
    return import.meta.env[viteKey];
  }
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[nextKey]) return process.env[nextKey];
    if (process.env[viteKey]) return process.env[viteKey];
  }
  return fallback;
};

const firebaseConfig = {
  apiKey: firebaseConfigData?.apiKey || getEnvVar('VITE_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY', 'demo-api-key'),
  authDomain: firebaseConfigData?.authDomain || getEnvVar('VITE_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'demo-app.firebaseapp.com'),
  projectId: firebaseConfigData?.projectId || getEnvVar('VITE_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'demo-app'),
  storageBucket: firebaseConfigData?.storageBucket || getEnvVar('VITE_FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'demo-app.appspot.com'),
  messagingSenderId: firebaseConfigData?.messagingSenderId || getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', '1234567890'),
  appId: firebaseConfigData?.appId || getEnvVar('VITE_FIREBASE_APP_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID', '1:1234567890:web:123456')
};

const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);

const databaseId = firebaseConfigData?.firestoreDatabaseId;
const db: Firestore = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);

const googleProvider = new GoogleAuthProvider();

export { app, auth, db, googleProvider };
export default app;
