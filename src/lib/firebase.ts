/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  doc, 
  getDoc, 
  getDocFromServer,
  setDoc, 
  getDocs, 
  collection, 
  onSnapshot, 
  deleteDoc, 
  updateDoc,
  query
} from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';

// Use the applet configuration to ensure we are connecting to the correct sandboxed database instance
const firebaseConfig = {
  apiKey: appletConfig.apiKey,
  authDomain: appletConfig.authDomain,
  projectId: appletConfig.projectId,
  storageBucket: appletConfig.storageBucket,
  messagingSenderId: appletConfig.messagingSenderId,
  appId: appletConfig.appId,
  measurementId: appletConfig.measurementId || ""
};

// Ensure single source of initialization to prevent duplicate app errors
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const firestoreDbId = (appletConfig as any).firestoreDatabaseId || undefined;

// Use initializeFirestore with experimentalForceLongPolling to prevent iframe proxy timeout / websocket disruption
export const db = firestoreDbId
  ? initializeFirestore(app, { experimentalForceLongPolling: true }, firestoreDbId)
  : initializeFirestore(app, { experimentalForceLongPolling: true });

export const auth = getAuth(app);
export const DEFAULT_FIREBASE_CONFIG = appletConfig;

// Test connection on boot to verify correct synchronization
export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    await getDocFromServer(doc(db, 'system-config', 'check-connection'));
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("Firebase Connection check: ", msg);
    return { success: false, error: msg };
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: localStorage.getItem('ich100l_current_matric') || 'anonymous',
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function cleanData<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(cleanData) as any;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = (obj as any)[key];
        if (val !== undefined) {
          cleaned[key] = cleanData(val);
        }
      }
    }
    return cleaned;
  }
  return obj;
}

export function getSafeDocId(id: string): string {
  if (!id) return '';
  return id.trim().replace(/\//g, '-');
}

