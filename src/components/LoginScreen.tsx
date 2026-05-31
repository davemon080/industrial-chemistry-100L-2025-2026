/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, KeyRound, User, Users, GraduationCap, ArrowRight, ShieldCheck, Info, Eye, EyeOff } from 'lucide-react';
import GlassCard from './GlassCard';
import { DEFAULT_COURSE_REP_MATRIC } from '../data/defaultData';
import { db, getSafeDocId } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const getUsersDB = () => {
  try {
    const db = localStorage.getItem('ich100l_users_db');
    if (db) return JSON.parse(db);
    // Seed with Course Rep password to 123456 as requested
    const defaultDB = {
      [DEFAULT_COURSE_REP_MATRIC]: {
        email: 'daveimagodei@gmail.com',
        matricNumber: DEFAULT_COURSE_REP_MATRIC,
        name: 'David Adebayo',
        password: '123456',
      }
    };
    localStorage.setItem('ich100l_users_db', JSON.stringify(defaultDB));
    return defaultDB;
  } catch {
    return {};
  }
};

const saveUserToDB = (user: any) => {
  try {
    const db = getUsersDB();
    db[user.matricNumber] = user;
    localStorage.setItem('ich100l_users_db', JSON.stringify(db));
  } catch (err) {
    console.error(err);
  }
};

interface LoginScreenProps {
  onLoginSuccess: (user: { email: string; matricNumber: string; name: string; createdAt?: string; activeSessionId?: string }) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [matricNumber, setMatricNumber] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const validateMatric = (nm: string) => {
    return nm.trim();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !matricNumber || !password) {
      setError('Please fill in all requested credentials.');
      return;
    }

    const cleanedMatric = validateMatric(matricNumber);

    // Ensure we have a persistent local device/session ID to check concurrency
    let sessionId = localStorage.getItem('ich100l_session_id');
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
      localStorage.setItem('ich100l_session_id', sessionId);
    }

    try {
      // 1. Check online Firestore DB
      const docRef = doc(db, 'users', getSafeDocId(cleanedMatric));
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const userData = docSnap.data();
        if (userData.password !== password) {
          setError('Incorrect password for this matriculation number.');
          return;
        }

        // Overwrite the online session ID so only this active device is authenticated
        await setDoc(docRef, { activeSessionId: sessionId }, { merge: true });

        const finalUser = {
          email: userData.email,
          matricNumber: userData.matricNumber,
          name: userData.name,
          createdAt: userData.createdAt,
          activeSessionId: sessionId,
        };

        // Sync cache
        saveUserToDB(finalUser);
        onLoginSuccess(finalUser);
        return;
      }
    } catch (err) {
      console.warn('Fallback to LocalStorage cache:', err);
    }

    // 2. Cache Fallback check
    const localDB = getUsersDB();
    const existingUser = localDB[cleanedMatric];

    if (existingUser) {
      if (existingUser.password !== password) {
        setError('Incorrect password for this matriculation number.');
        return;
      }

      // Try syncing online session id in background even if login initially loaded offline
      try {
        await setDoc(doc(db, 'users', getSafeDocId(cleanedMatric)), { activeSessionId: sessionId }, { merge: true });
      } catch (errSync) {
        console.warn('[Session] Silent background session ID sync missed:', errSync);
      }

      onLoginSuccess({
        email: existingUser.email,
        matricNumber: existingUser.matricNumber,
        name: existingUser.name,
        createdAt: existingUser.createdAt,
        activeSessionId: sessionId,
      });
    } else {
      // Setup dynamic account if they use course rep matric representing fresh first login
      if (cleanedMatric === DEFAULT_COURSE_REP_MATRIC) {
        const defaultRep = {
          email: email.trim() || 'daveimagodei@gmail.com',
          matricNumber: cleanedMatric,
          name: 'David Adebayo',
          password: password,
          createdAt: new Date().toISOString(),
          activeSessionId: sessionId,
        };
        try {
          await setDoc(doc(db, 'users', getSafeDocId(cleanedMatric)), defaultRep);
        } catch (err) {
          console.error(err);
        }
        saveUserToDB(defaultRep);
        onLoginSuccess({
          email: defaultRep.email,
          matricNumber: defaultRep.matricNumber,
          name: defaultRep.name,
          createdAt: defaultRep.createdAt,
          activeSessionId: sessionId,
        });
      } else {
        setError('Matric number is not registered yet. Please click "Don\'t have an account?" above to register.');
      }
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !matricNumber || !name || !password) {
      setError('All registration fields are required.');
      return;
    }

    const cleanedMatric = validateMatric(matricNumber);

    // Generate session ID
    let sessionId = localStorage.getItem('ich100l_session_id');
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
      localStorage.setItem('ich100l_session_id', sessionId);
    }

    try {
      const docRef = doc(db, 'users', getSafeDocId(cleanedMatric));
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setError('An account with this matriculation number is already registered.');
        return;
      }
    } catch (err) {
      console.warn('Online check failed, checking offline cache:', err);
    }

    const localDB = getUsersDB();
    if (localDB[cleanedMatric]) {
      setError('An account with this matriculation number is already registered.');
      return;
    }

    const newUser = {
      email: email.trim(),
      matricNumber: cleanedMatric,
      name: name.trim(),
      password: password,
      createdAt: new Date().toISOString(),
      activeSessionId: sessionId,
    };

    try {
      await setDoc(doc(db, 'users', getSafeDocId(cleanedMatric)), newUser);
    } catch (err) {
      console.error(err);
    }

    saveUserToDB(newUser);

    onLoginSuccess({
      email: newUser.email,
      matricNumber: newUser.matricNumber,
      name: newUser.name,
      createdAt: newUser.createdAt,
      activeSessionId: sessionId,
    });
  };

  return (
    <div className="min-h-screen grid items-center justify-center p-4 bg-[#0f172a] relative overflow-hidden">
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-violet-500/10 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md z-10"
      >
        {/* Brand Logo and Title */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="relative mb-3 flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-500 shadow-[0_0_24px_rgba(99,102,241,0.4)]">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-display font-bold tracking-tight bg-gradient-to-r from-slate-100 via-indigo-200 to-violet-300 bg-clip-text text-transparent">
            ICH100L
          </h1>
          <p className="text-sm font-mono text-slate-400 mt-1">Chemistry Activities & Broadcasts Portal</p>
        </div>

        <GlassCard className="border border-slate-800/80 shadow-2xl relative overflow-hidden backdrop-blur-2xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-display font-bold text-slate-100">
              {isRegistering ? 'Create Student Account' : 'Portal Access Sign-in'}
            </h2>
            <button
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError('');
              }}
              className="text-xs text-indigo-400 font-medium hover:underline focus:outline-none"
            >
              {isRegistering ? 'Already have an account?' : "Don't have an account?"}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
            {isRegistering && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 font-sans">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. David Adebayo"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-100 text-base focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 font-sans">Institutional Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. student@ich100l.edu"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-100 text-base focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 font-sans flex justify-between items-center">
                <span>Matriculation Number</span>
                <span className="text-[10px] font-mono text-slate-500">Format: YYYY/ps/ich/XXXX</span>
              </label>
              <div className="relative">
                <GraduationCap className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={matricNumber}
                  onChange={(e) => setMatricNumber(e.target.value)}
                  placeholder="e.g. 2025/ps/ich/1000"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-100 text-base font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 font-sans">Password</label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-100 text-base focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 mt-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-[0_4px_12px_rgba(99,102,241,0.25)] hover:shadow-[0_4px_16px_rgba(99,102,241,0.4)] transition-all"
            >
              <span>{isRegistering ? 'Register & Access Portal' : 'Authenticate Credentials'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
}
