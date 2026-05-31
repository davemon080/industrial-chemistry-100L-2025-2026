/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Award, GraduationCap, Clock, Bell, LogOut, CheckCircle2, Loader2 } from 'lucide-react';

import { User, DayOfWeek, Activity, Deadline, Announcement } from './types';
import {
  DEFAULT_COURSE_REP_MATRIC,
  DEFAULT_ACTIVITIES,
  DEFAULT_DEADLINES,
  DEFAULT_ANNOUNCEMENTS
} from './data/defaultData';

import { db, cleanData, getSafeDocId } from './lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs, getDoc } from 'firebase/firestore';

// Custom subcomponents
import GlassCard from './components/GlassCard';
import BottomNav, { TabType } from './components/BottomNav';
import LoginScreen from './components/LoginScreen';
import Scheduler from './components/Scheduler';
import Deadlines from './components/Deadlines';
import Announcements from './components/Announcements';
import ProfileView from './components/ProfileView';
import AddEditPage from './components/AddEditPage';
import NotificationsPage, { NotificationItem } from './components/NotificationsPage';
import SubscriptionPaywall from './components/SubscriptionPaywall';
import ModulesView from './components/ModulesView';

function getMondayOfCurrentWeek(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function getInitials(nm: string) {
  if (!nm) return 'ST';
  const parts = nm.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function App() {
  // Authentication state
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('ich100l_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Timetable and announcements databases - dynamic fresh connection
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Listen to subscription status in real-time
  const [subStatus, setSubStatus] = useState<'loading' | 'active' | 'inactive'>('loading');
  const [subscriptionDetails, setSubscriptionDetails] = useState<any>(null);

  // Logo branding status
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [isEditingLogo, setIsEditingLogo] = useState(false);
  const [logoInput, setLogoInput] = useState('');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState('');

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoUploadError('');
    setIsUploadingLogo(true);

    if (file.size > 2 * 1024 * 1024) {
      setLogoUploadError('Logo image is too large (max 2MB allowed).');
      setIsUploadingLogo(false);
      return;
    }

    const formData = new FormData();
    formData.append('logo', file);

    try {
      let finalUrl = '';
      try {
        const resp = await fetch('/api/upload-logo', {
          method: 'POST',
          body: formData,
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.success) {
            finalUrl = data.url;
          }
        }
      } catch (err) {
        console.warn('Backend API logo upload failed, switching to serverless Base64 storage:', err);
      }

      if (!finalUrl) {
        // Fallback for Vercel: Read in-browser as Base64 data URI
        finalUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(file);
        });
      }

      setLogoInput(finalUrl);
      await setDoc(doc(db, 'system-config', 'app-branding'), { logoUrl: finalUrl }, { merge: true });
      setLogoUrl(finalUrl);
      setIsEditingLogo(false);
    } catch (err) {
      console.error('Logo upload error:', err);
      setLogoUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const [isVerifyingURL, setIsVerifyingURL] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [verificationSuccess, setVerificationSuccess] = useState('');

  // Listen to branding logo
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system-config', 'app-branding'), (snap) => {
      if (snap.exists()) {
        const url = snap.data().logoUrl || '';
        setLogoUrl(url);
        setLogoInput(url);
      }
    }, (err) => {
      console.warn('Listening app branding logo failed:', err);
    });
    return () => unsub();
  }, []);

  const handleUpdateLogo = async (url: string) => {
    try {
      await setDoc(doc(db, 'system-config', 'app-branding'), { logoUrl: url }, { merge: true });
      setLogoUrl(url);
      setIsEditingLogo(false);
    } catch (err) {
      console.error('Failed to update app branding logo:', err);
    }
  };

  // Handle Paystack callback parameter capture
  useEffect(() => {
    if (!currentUser) return;

    const queryParams = new URLSearchParams(window.location.search);
    const reference = queryParams.get('reference') || queryParams.get('trxref');

    if (reference) {
      const verifyPayment = async () => {
        setIsVerifyingURL(true);
        setVerificationError('');
        setVerificationSuccess('');
        try {
          const res = await fetch('/api/paystack-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference })
          });
          const data = await res.json();
          if (data.success) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 30); // 30-day billing period

            const subData = {
              status: 'active',
              matricNumber: currentUser.matricNumber,
              email: currentUser.email,
              name: currentUser.name,
              lastPaymentDate: new Date().toISOString(),
              expiryDate: expiryDate.toISOString(),
              reference: reference,
              amountPaid: 200,
            };

            await setDoc(doc(db, 'subscriptions', getSafeDocId(currentUser.matricNumber)), subData);

            // Record chronological log of the success transaction
            await setDoc(doc(db, 'payments', reference), {
              reference: reference,
              matricNumber: currentUser.matricNumber,
              email: currentUser.email || `${currentUser.matricNumber.replace(/\//g, '_')}@ich100l.edu`,
              name: currentUser.name,
              amount: 200,
              paidAt: new Date().toISOString(),
              status: 'success'
            });

            setVerificationSuccess('Payment verified successfully! Account upgraded.');
            
            // Sync cache
            localStorage.setItem(`ich100l_sub_${currentUser.matricNumber}`, JSON.stringify({
              status: 'active',
              expiryDate: expiryDate.toISOString(),
              lastPaymentDate: subData.lastPaymentDate,
              reference: subData.reference
            }));

            setSubStatus('active');
          } else {
            setVerificationError(data.message || 'Payment validation failed.');
          }
        } catch (err) {
          console.error("URL-Reference verification error:", err);
          setVerificationError('Unable to connect to transaction verification server.');
        } finally {
          setIsVerifyingURL(false);
          // Clean URL parameters
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('reference');
            url.searchParams.delete('trxref');
            window.history.replaceState({}, document.title, url.pathname + url.search);
          } catch (e) {}
        }
      };

      verifyPayment();
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setSubStatus('inactive');
      return;
    }

    if (currentUser.matricNumber === DEFAULT_COURSE_REP_MATRIC) {
      setSubStatus('active');
      setSubscriptionDetails({
        status: 'active',
        expiryDate: '2030-12-31',
        lastPaymentDate: 'Exempt',
        reference: 'ADMIN-BYPASS'
      });
      return;
    }

    try {
      const cached = localStorage.getItem(`ich100l_sub_${currentUser.matricNumber}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.expiryDate && parsed.expiryDate > new Date().toISOString()) {
          setSubStatus('active');
          setSubscriptionDetails(parsed);
        }
      }
    } catch (e) {
      console.warn('Read cached subscription failed:', e);
    }

    const unsubscribe = onSnapshot(doc(db, 'subscriptions', getSafeDocId(currentUser.matricNumber)), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const isExpired = data.expiryDate ? new Date().toISOString() > data.expiryDate : true;
        
        const details = {
          status: isExpired ? 'inactive' : 'active',
          expiryDate: data.expiryDate,
          lastPaymentDate: data.lastPaymentDate,
          reference: data.reference
        };

        setSubscriptionDetails(details);
        setSubStatus(isExpired ? 'inactive' : 'active');
        localStorage.setItem(`ich100l_sub_${currentUser.matricNumber}`, JSON.stringify(details));
      } else {
        setSubscriptionDetails({ status: 'inactive' });
        setSubStatus('inactive');
        localStorage.removeItem(`ich100l_sub_${currentUser.matricNumber}`);
      }
    }, (error) => {
      console.warn('Listening to subscriptions collection failed:', error);
      setSubStatus((prev) => prev === 'loading' ? 'inactive' : prev);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleUpdateSubStatus = () => {
    if (!currentUser) return;
    try {
      const cached = localStorage.getItem(`ich100l_sub_${currentUser.matricNumber}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.expiryDate && parsed.expiryDate > new Date().toISOString()) {
          setSubStatus('active');
          setSubscriptionDetails(parsed);
        }
      }
    } catch(err) {}
  };

  // Self-Seed Default Academic Starter Data if Firestore collections are empty (with automatic weekly rollover)
  useEffect(() => {
    if (!currentUser) return;

    const wipeAndSeedIfNewWeek = async () => {
      try {
        const currentMonday = getMondayOfCurrentWeek();
        const configRef = doc(db, 'system-config', 'week-tracker');
        let needsWipe = false;

        const docSnap = await getDoc(configRef);
        if (!docSnap.exists()) {
          await setDoc(configRef, { lastMonday: currentMonday });
        } else {
          const trackerData = docSnap.data();
          if (trackerData.lastMonday !== currentMonday) {
            needsWipe = true;
          }
        }

        if (needsWipe) {
          console.log('entering a new week! wipe all previous week documents...');
          
          const actSnap = await getDocs(collection(db, 'activities'));
          for (const d of actSnap.docs) {
            await deleteDoc(doc(db, 'activities', d.id));
          }

          const dlSnap = await getDocs(collection(db, 'deadlines'));
          for (const d of dlSnap.docs) {
            await deleteDoc(doc(db, 'deadlines', d.id));
          }

          const annSnap = await getDocs(collection(db, 'announcements'));
          for (const d of annSnap.docs) {
            await deleteDoc(doc(db, 'announcements', d.id));
          }

          await setDoc(configRef, { 
            lastMonday: currentMonday, 
            wipedAt: new Date().toISOString() 
          });
          console.log('Automated week rollover database sweep completed.');
        }

        // Now seed default structures if they are now empty (or were empty originally)
        const activitiesRef = collection(db, 'activities');
        const activitiesSnap = await getDocs(activitiesRef);
        if (activitiesSnap.empty) {
          console.log('Database empty: Seeding default class schedule...');
          for (const act of DEFAULT_ACTIVITIES) {
            await setDoc(doc(db, 'activities', act.id), cleanData(act));
          }
        }

        const deadlinesRef = collection(db, 'deadlines');
        const deadlinesSnap = await getDocs(deadlinesRef);
        if (deadlinesSnap.empty) {
          console.log('Database empty: Seeding default chemical assignments...');
          for (const dl of DEFAULT_DEADLINES) {
            await setDoc(doc(db, 'deadlines', dl.id), cleanData(dl));
          }
        }

        const announcementsRef = collection(db, 'announcements');
        const announcementsSnap = await getDocs(announcementsRef);
        if (announcementsSnap.empty) {
          console.log('Database empty: Seeding default announcements...');
          for (const ann of DEFAULT_ANNOUNCEMENTS) {
            await setDoc(doc(db, 'announcements', ann.id), cleanData(ann));
          }
        }
      } catch (err) {
        console.warn('Auto-rollover and seeding failed:', err);
      }
    };

    wipeAndSeedIfNewWeek();
  }, [currentUser]);


  // Listen to Firestore real-time updates for activities
  useEffect(() => {
    if (!currentUser) return;
    let isInitial = true;
    const unsubscribe = onSnapshot(collection(db, 'activities'), (snapshot) => {
      const docs: Activity[] = [];
      snapshot.forEach((doc) => {
        docs.push({ ...doc.data(), id: doc.id } as Activity);
      });

      if (!isInitial) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data() as Activity;
            if (data.createdBy !== currentUser.matricNumber) {
              const notif: NotificationItem = {
                id: `notif-act-${Date.now()}-${change.doc.id}`,
                type: 'schedule',
                title: 'New Class Scheduled 📅',
                body: `${data.courseCode || 'ICH100L'}: "${data.title}" is scheduled on ${data.day} from ${data.timeStart} to ${data.timeEnd}.`,
                time: 'Just now',
                isRead: false,
                priority: 'info',
                referenceTab: 'schedule'
              };
              setNotifications((prev) => {
                if (prev.some(p => p.id === notif.id)) return prev;
                return [notif, ...prev];
              });
            }
          } else if (change.type === 'modified') {
            const data = change.doc.data() as Activity;
            if (data.createdBy !== currentUser.matricNumber) {
              const notif: NotificationItem = {
                id: `notif-act-mod-${Date.now()}-${change.doc.id}`,
                type: 'schedule',
                title: 'Class Schedule Updated 📝',
                body: `${data.courseCode || 'ICH100L'}: "${data.title}" on ${data.day} has been updated.`,
                time: 'Just now',
                isRead: false,
                priority: 'medium',
                referenceTab: 'schedule'
              };
              setNotifications((prev) => [notif, ...prev]);
            }
          } else if (change.type === 'removed') {
            const data = change.doc.data() as Activity;
            if (data.createdBy !== currentUser.matricNumber) {
              const notif: NotificationItem = {
                id: `notif-act-rem-${Date.now()}-${change.doc.id}`,
                type: 'schedule',
                title: 'Class Schedule Canceled ❌',
                body: `${data.courseCode || 'ICH100L'}: "${data.title}" has been canceled or removed.`,
                time: 'Just now',
                isRead: false,
                priority: 'high',
                referenceTab: 'schedule'
              };
              setNotifications((prev) => [notif, ...prev]);
            }
          }
        });
      }

      setActivities(docs);
      isInitial = false;
    }, (error) => {
      console.warn('Firestore listening to activities failed:', error);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Listen to Firestore real-time updates for deadlines
  useEffect(() => {
    if (!currentUser) return;
    let isInitial = true;
    const unsubscribe = onSnapshot(collection(db, 'deadlines'), (snapshot) => {
      const docs: Deadline[] = [];
      snapshot.forEach((doc) => {
        docs.push({ ...doc.data(), id: doc.id } as Deadline);
      });

      if (!isInitial) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data() as Deadline;
            if (data.createdBy !== currentUser.matricNumber) {
              const notif: NotificationItem = {
                id: `notif-dl-${Date.now()}-${change.doc.id}`,
                type: 'deadline',
                title: `Assignment Published: ${data.courseCode} 📣`,
                body: `New deadline: "${data.title}". Due date: ${data.dueDate}.`,
                time: 'Just now',
                isRead: false,
                priority: 'high',
                referenceTab: 'deadlines'
              };
              setNotifications((prev) => {
                if (prev.some(p => p.id === notif.id)) return prev;
                return [notif, ...prev];
              });
            }
          } else if (change.type === 'modified') {
            const data = change.doc.data() as Deadline;
            if (data.createdBy !== currentUser.matricNumber) {
              const notif: NotificationItem = {
                id: `notif-dl-mod-${Date.now()}-${change.doc.id}`,
                type: 'deadline',
                title: `Assignment Revision: ${data.courseCode} 📝`,
                body: `Deadline details for "${data.title}" have been updated.`,
                time: 'Just now',
                isRead: false,
                priority: 'medium',
                referenceTab: 'deadlines'
              };
              setNotifications((prev) => [notif, ...prev]);
            }
          } else if (change.type === 'removed') {
            const data = change.doc.data() as Deadline;
            if (data.createdBy !== currentUser.matricNumber) {
              const notif: NotificationItem = {
                id: `notif-dl-rem-${Date.now()}-${change.doc.id}`,
                type: 'deadline',
                title: `Assignment Removed: ${data.courseCode} 🗑️`,
                body: `The deadline for "${data.title}" has been deleted.`,
                time: 'Just now',
                isRead: false,
                priority: 'info',
                referenceTab: 'deadlines'
              };
              setNotifications((prev) => [notif, ...prev]);
            }
          }
        });
      }

      setDeadlines(docs);
      isInitial = false;
    }, (error) => {
      console.warn('Firestore listening to deadlines failed:', error);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Listen to Firestore real-time updates for announcements
  useEffect(() => {
    if (!currentUser) return;
    let isInitial = true;
    const unsubscribe = onSnapshot(collection(db, 'announcements'), (snapshot) => {
      const docs: Announcement[] = [];
      snapshot.forEach((doc) => {
        docs.push({ ...doc.data(), id: doc.id } as Announcement);
      });

      if (!isInitial) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data() as Announcement;
            const isMe = data.author?.includes(currentUser.name);
            if (!isMe) {
              const notif: NotificationItem = {
                id: `notif-ann-${Date.now()}-${change.doc.id}`,
                type: 'announcement',
                title: `Urgent Course Broadcaster 🚨`,
                body: `"${data.title}": ${data.content.substring(0, 70)}${data.content.length > 70 ? '...' : ''}`,
                time: 'Just now',
                isRead: false,
                priority: (data.priority as any) || 'medium',
                referenceTab: 'announcements'
              };
              setNotifications((prev) => {
                if (prev.some(p => p.id === notif.id)) return prev;
                return [notif, ...prev];
              });
            }
          } else if (change.type === 'modified') {
            const data = change.doc.data() as Announcement;
            const isMe = data.author?.includes(currentUser.name);
            if (!isMe) {
              const notif: NotificationItem = {
                id: `notif-ann-mod-${Date.now()}-${change.doc.id}`,
                type: 'announcement',
                title: `Broadcast Broadcast Updated 📣`,
                body: `"${data.title}" was updated in real-time.`,
                time: 'Just now',
                isRead: false,
                priority: (data.priority as any) || 'medium',
                referenceTab: 'announcements'
              };
              setNotifications((prev) => [notif, ...prev]);
            }
          } else if (change.type === 'removed') {
            const data = change.doc.data() as Announcement;
            const isMe = data.author?.includes(currentUser.name);
            if (!isMe) {
              const notif: NotificationItem = {
                id: `notif-ann-rem-${Date.now()}-${change.doc.id}`,
                type: 'announcement',
                title: `Broadcast Removed 🗑️`,
                body: `"${data.title}" notice was deleted.`,
                time: 'Just now',
                isRead: false,
                priority: 'info',
                referenceTab: 'announcements'
              };
              setNotifications((prev) => [notif, ...prev]);
            }
          }
        });
      }

      setAnnouncements(docs);
      isInitial = false;
    }, (error) => {
      console.warn('Firestore listening to announcements failed:', error);
    });
    return () => unsubscribe();
  }, [currentUser]);

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const stored = localStorage.getItem('ich100l_notifications');
      if (stored) return JSON.parse(stored);
      
      const defaults: NotificationItem[] = [
        {
          id: 'notif-1',
          type: 'announcement',
          title: 'Practical Handbook Distributed',
          body: 'Collect physical guides and worksheets for ICH100L from course assistants at administrative center.',
          time: '2 hours ago',
          isRead: false,
          priority: 'medium',
          referenceTab: 'announcements'
        },
        {
          id: 'notif-2',
          type: 'deadline',
          title: 'Salt Analysis Worksheet Submission',
          body: 'Course Rep posted lab sheet schema submission workspace details. Click details to check prompt guidelines.',
          time: '5 hours ago',
          isRead: false,
          priority: 'high',
          referenceTab: 'deadlines'
        },
        {
          id: 'notif-3',
          type: 'schedule',
          title: 'Introductory Lab Safety Lecture',
          body: 'Syllabus coordinator scheduled physical lecture in main auditorium. Check Monday timeline.',
          time: '1 day ago',
          isRead: true,
          priority: 'info',
          referenceTab: 'schedule'
        }
      ];
      return defaults;
    } catch {
      return [];
    }
  });

  // UI state managers
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [daySelected, setDaySelected] = useState<DayOfWeek>('Monday');
  const [addingOrEditing, setAddingOrEditing] = useState<{
    type: 'schedule' | 'deadline' | 'announcement';
    editActivity?: Activity | null;
  } | null>(null);

  // Sync to localStorage on updates
  useEffect(() => {
    localStorage.setItem('ich100l_notifications', JSON.stringify(notifications));
  }, [notifications]);

  // Sync to localStorage on updates
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('ich100l_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('ich100l_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('ich100l_activities', JSON.stringify(activities));
  }, [activities]);

  useEffect(() => {
    localStorage.setItem('ich100l_deadlines', JSON.stringify(deadlines));
  }, [deadlines]);

  useEffect(() => {
    localStorage.setItem('ich105l_announcements', JSON.stringify(announcements));
    localStorage.setItem('ich100l_announcements', JSON.stringify(announcements));
  }, [announcements]);

  const isCourseRep = currentUser?.matricNumber === DEFAULT_COURSE_REP_MATRIC;

  // Sign out handler
  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab('schedule');
  };

  // Reset database back to syllabus default starter set in Firestore
  const handleResetData = async () => {
    try {
      // 1. Reset Activities
      const actSnap = await getDocs(collection(db, 'activities'));
      for (const d of actSnap.docs) {
        await deleteDoc(doc(db, 'activities', d.id));
      }
      for (const act of DEFAULT_ACTIVITIES) {
        await setDoc(doc(db, 'activities', act.id), cleanData(act));
      }

      // 2. Reset Deadlines
      const dlSnap = await getDocs(collection(db, 'deadlines'));
      for (const d of dlSnap.docs) {
        await deleteDoc(doc(db, 'deadlines', d.id));
      }
      for (const dl of DEFAULT_DEADLINES) {
        await setDoc(doc(db, 'deadlines', dl.id), cleanData(dl));
      }

      // 3. Reset Announcements
      const annSnap = await getDocs(collection(db, 'announcements'));
      for (const d of annSnap.docs) {
        await deleteDoc(doc(db, 'announcements', d.id));
      }
      for (const ann of DEFAULT_ANNOUNCEMENTS) {
        await setDoc(doc(db, 'announcements', ann.id), cleanData(ann));
      }

      setDaySelected('Monday');
      setActiveTab('schedule');
    } catch (err) {
      console.error('Failed to reset Firestore databases:', err);
    }
  };

  // Activity management actions
  const handleAddActivity = async (newAct: Omit<Activity, 'id' | 'createdBy'>) => {
    const actId = `act-custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const act: Activity = {
      ...newAct,
      id: actId,
      createdBy: currentUser?.matricNumber || 'Rep'
    };
    try {
      await setDoc(doc(db, 'activities', actId), cleanData(act));
    } catch (err) {
      console.error('Error saving activity:', err);
    }
    setActivities((prev) => {
      if (prev.some((a) => a.id === act.id)) return prev;
      return [...prev, act];
    });

    const notif: NotificationItem = {
      id: `notif-act-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: 'schedule',
      title: 'New Class Scheduled 📅',
      body: `${act.courseCode}: ${act.title} is now scheduled on ${act.day} from ${act.timeStart} to ${act.timeEnd}.`,
      time: 'Just now',
      isRead: false,
      priority: 'info',
      referenceTab: 'schedule'
    };
    setNotifications((prev) => [notif, ...prev]);
  };

  const handleUpdateActivity = async (id: string, updatedAct: Omit<Activity, 'id' | 'createdBy'>) => {
    try {
      const docRef = doc(db, 'activities', id);
      await setDoc(docRef, cleanData({ ...updatedAct, id, createdBy: currentUser?.matricNumber || 'Rep' }), { merge: true });
    } catch (err) {
      console.error('Error updating activity:', err);
    }
    setActivities((prev) =>
      prev.map((act) => (act.id === id ? { ...act, ...updatedAct } : act))
    );
  };

  const handleDeleteActivity = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'activities', id));
    } catch (err) {
      console.error('Error deleting activity:', err);
    }
    setActivities((prev) => prev.filter((a) => a.id !== id));
  };

  // Deadline management actions
  const handleToggleDeadline = async (id: string) => {
    const target = deadlines.find((d) => d.id === id);
    if (target) {
      const nextCompleted = !target.isCompleted;
      try {
        await setDoc(doc(db, 'deadlines', id), cleanData({ isCompleted: nextCompleted }), { merge: true });
      } catch (err) {
        console.error('Error toggling deadline:', err);
      }
    }
    setDeadlines((prev) =>
      prev.map((d) => (d.id === id ? { ...d, isCompleted: !d.isCompleted } : d))
    );
  };

  const handleAddDeadline = async (newDl: Omit<Deadline, 'id' | 'isCompleted' | 'createdBy'>) => {
    const dlId = `dl-custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const dl: Deadline = {
      ...newDl,
      id: dlId,
      isCompleted: false,
      createdBy: currentUser?.matricNumber || 'Rep'
    };
    try {
      await setDoc(doc(db, 'deadlines', dlId), cleanData(dl));
    } catch (err) {
      console.error('Error adding deadline:', err);
    }
    setDeadlines((prev) => {
      if (prev.some((d) => d.id === dl.id)) return prev;
      return [dl, ...prev];
    });

    const notif: NotificationItem = {
      id: `notif-dl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: 'deadline',
      title: `Assignment Published: ${dl.courseCode} 📣`,
      body: `New deadline posted: "${dl.title}". Due date set for ${dl.dueDate}.`,
      time: 'Just now',
      isRead: false,
      priority: 'high',
      referenceTab: 'deadlines'
    };
    setNotifications((prev) => [notif, ...prev]);
  };

  const handleDeleteDeadline = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'deadlines', id));
    } catch (err) {
      console.error('Error deleting deadline:', err);
    }
    setDeadlines((prev) => prev.filter((d) => d.id !== id));
  };

  // Announcement management actions
  const handleAddAnnouncement = async (newAnn: Omit<Announcement, 'id' | 'date' | 'author'>) => {
    const today = new Date();
    const dateFormatted = today.toISOString().split('T')[0];
    const annId = `ann-custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const ann: Announcement = {
      ...newAnn,
      id: annId,
      date: dateFormatted,
      author: currentUser?.name ? `${currentUser.name} (Rep)` : 'Course Rep'
    };
    try {
      await setDoc(doc(db, 'announcements', annId), cleanData(ann));
    } catch (err) {
      console.error('Error adding announcement:', err);
    }
    setAnnouncements((prev) => {
      if (prev.some((a) => a.id === ann.id)) return prev;
      return [ann, ...prev];
    });

    const notif: NotificationItem = {
      id: `notif-ann-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: 'announcement',
      title: `Urgent Course Broadcaster 🚨`,
      body: `"${ann.title}": ${ann.content.substring(0, 70)}${ann.content.length > 70 ? '...' : ''}`,
      time: 'Just now',
      isRead: false,
      priority: ann.priority,
      referenceTab: 'announcements'
    };
    setNotifications((prev) => [notif, ...prev]);
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'announcements', id));
    } catch (err) {
      console.error('Error deleting announcement:', err);
    }
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  // View Router mapping
  const renderTabContent = () => {
    // If subscription is loading, show a neat themed loading element on restricted tabs
    if (subStatus === 'loading' && activeTab !== 'profile') {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
          <p className="text-sm font-sans">Checking student billing registry...</p>
        </div>
      );
    }

    // Paywall blocks access to schedule, deadlines, announcements, and modules
    const isRestrictedTab = ['schedule', 'deadlines', 'announcements', 'modules'].includes(activeTab);
    if (subStatus === 'inactive' && isRestrictedTab) {
      return (
        <SubscriptionPaywall 
          user={{
            email: currentUser?.email || 'student@ich100l.edu',
            matricNumber: currentUser?.matricNumber || '',
            name: currentUser?.name || 'Chemistry Student'
          }}
          subStatus={subStatus}
          isCourseRep={isCourseRep}
          subscriptionDetails={subscriptionDetails}
          onSuccessVerification={() => {
            // Hot trigger reload
            handleUpdateSubStatus();
          }}
        />
      );
    }

    switch (activeTab) {
      case 'subscription':
        return (
          <SubscriptionPaywall
            user={{
              email: currentUser?.email || 'student@ich100l.edu',
              matricNumber: currentUser?.matricNumber || '',
              name: currentUser?.name || 'Chemistry Student'
            }}
            subStatus={subStatus}
            isCourseRep={isCourseRep}
            subscriptionDetails={subscriptionDetails}
            onSuccessVerification={() => {
              handleUpdateSubStatus();
            }}
          />
        );
      case 'modules':
        return (
          <ModulesView
            isCourseRep={isCourseRep}
            userMatric={currentUser?.matricNumber || ''}
          />
        );
      case 'schedule':
        return (
          <Scheduler
            activities={activities}
            currentUserMatric={currentUser?.matricNumber || ''}
            isCourseRep={isCourseRep}
            onDeleteActivity={handleDeleteActivity}
            onEditActivity={(act) => setAddingOrEditing({ type: 'schedule', editActivity: act })}
            daySelected={daySelected}
            setDaySelected={setDaySelected}
          />
        );
      case 'deadlines':
        return (
          <Deadlines
            deadlines={deadlines}
            isCourseRep={isCourseRep}
            onToggleComplete={handleToggleDeadline}
            onDeleteDeadline={handleDeleteDeadline}
          />
        );
      case 'announcements':
        return (
          <Announcements
            announcements={announcements}
            isCourseRep={isCourseRep}
            onDeleteAnnouncement={handleDeleteAnnouncement}
          />
        );
      case 'profile':
        return (
          <ProfileView
            user={{
              email: currentUser?.email || '',
              matricNumber: currentUser?.matricNumber || '',
              name: currentUser?.name || 'Student'
            }}
            onLogout={handleLogout}
            onResetData={handleResetData}
            stats={{
              totalActivities: activities.length,
              pendingDeadlines: deadlines.filter((d) => !d.isCompleted).length,
              completedDeadlines: deadlines.filter((d) => d.isCompleted).length,
              announcementCount: announcements.length
            }}
            subStatus={subStatus}
            subscriptionDetails={subscriptionDetails}
            onUpdateSubStatus={handleUpdateSubStatus}
            onChangeTab={setActiveTab}
          />
        );
      case 'notifications' as any:
        return (
          <NotificationsPage
            deadlines={deadlines}
            announcements={announcements}
            activities={activities}
            onBack={() => setActiveTab('schedule')}
            onNavigateToTab={(tab) => setActiveTab(tab)}
            notifications={notifications}
            onMarkAllAsRead={() => {
              setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
            }}
            onToggleRead={(id) => {
              setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, isRead: !n.isRead } : n))
              );
            }}
            onClearNotifications={() => {
              setNotifications([]);
            }}
          />
        );
      default:
        return null;
    }
  };

  // If unauthorized, show login overlay
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={setCurrentUser} />;
  }

  if (addingOrEditing) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-[#0f172a] text-slate-100 flex flex-col relative">
        <div className="absolute top-0 left-0 right-0 h-[400px] bg-gradient-to-b from-indigo-500/5 via-[#0f172a]/2 to-[#0f172a]" />
        
        {/* Prime Core Scrollable workspace container */}
        <main className="flex-1 overflow-y-auto max-w-md mx-auto w-full px-4 pt-4 pb-12 z-10 no-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="h-full flex flex-col"
            >
              <AddEditPage
                type={addingOrEditing.type}
                editActivity={addingOrEditing.editActivity}
                daySelected={daySelected}
                currentUserMatric={currentUser?.matricNumber || ''}
                onAddActivity={handleAddActivity}
                onUpdateActivity={handleUpdateActivity}
                onAddDeadline={handleAddDeadline}
                onAddAnnouncement={handleAddAnnouncement}
                onCancel={() => setAddingOrEditing(null)}
              />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0f172a] text-slate-100 flex flex-col relative">
      {/* Verification Overlays */}
      {isVerifyingURL && (
        <div className="fixed inset-0 bg-slate-950/90 z-[99999] flex flex-col items-center justify-center p-4 backdrop-blur-md">
          <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4 max-w-xs w-full shadow-2xl">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto" />
            <h3 className="text-slate-100 font-display font-bold text-base">Verifying payment...</h3>
            <p className="text-xs text-slate-400 font-sans">Connecting to security servers to activate your account. Please wait...</p>
          </div>
        </div>
      )}

      {verificationError && (
        <div className="fixed inset-0 bg-slate-950/90 z-[9999] flex flex-col items-center justify-center p-4 backdrop-blur-md">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4 max-w-xs w-full shadow-2xl">
            <div className="shrink-0 w-12 h-12 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <h3 className="text-slate-100 font-display font-bold text-base">Verification issue</h3>
            <p className="text-xs text-slate-400 font-sans">{verificationError}</p>
            <button onClick={() => setVerificationError('')} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer">
              Acknowledge & Dismiss
            </button>
          </div>
        </div>
      )}

      {verificationSuccess && (
        <div className="fixed inset-0 bg-slate-950/90 z-[9999] flex flex-col items-center justify-center p-4 backdrop-blur-md">
          <div className="p-6 rounded-2xl bg-slate-900 border border-emerald-500/20 text-center space-y-4 max-w-xs w-full shadow-2xl">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <h3 className="text-slate-100 font-display font-bold text-base">Payment Verified!</h3>
            <p className="text-xs text-emerald-300 font-sans">{verificationSuccess}</p>
            <button onClick={() => setVerificationSuccess('')} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer">
              Start Exploring Dashboard
            </button>
          </div>
        </div>
      )}

      {isEditingLogo && (
        <div className="fixed inset-0 bg-slate-950/85 z-[9999] flex flex-col items-center justify-center p-4 backdrop-blur-md">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4 max-w-sm w-full shadow-2xl">
            <h3 className="text-slate-100 font-display font-extrabold text-base">Change Application Logo</h3>
            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              As the registered Course Representative, you can set a custom web URL or upload a graphic file from your local storage to update the branding logo live on all screens.
            </p>

            <div className="text-left space-y-1">
              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold block">UPLOAD IMAGE FROM DEVICE</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoFileChange}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950/40 border border-slate-800 text-slate-300 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-mono file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20 cursor-pointer"
              />
              {isUploadingLogo && (
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-indigo-400">
                  <span className="animate-spin font-sans text-xs inline-block">⏳</span>
                  <span>Configuring and caching image upload...</span>
                </div>
              )}
              {logoUploadError && (
                <p className="text-[10px] text-rose-400 font-medium mt-1">⚠️ {logoUploadError}</p>
              )}
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
              <div className="relative flex justify-center text-[10px] uppercase font-mono"><span className="bg-slate-900 px-2 text-slate-500">OR DEFINE EXTERNAL URL</span></div>
            </div>

            <div className="text-left space-y-2">
              <input
                type="text"
                value={logoInput}
                onChange={(e) => setLogoInput(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 outline-none focus:border-indigo-500 transition-colors"
              />
              <span className="text-[9px] text-slate-500 leading-normal block">
                💡 Paste any public PNG, JPG, or web storage referrer link. To reset back to default, empty the input box.
              </span>
            </div>
            
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditingLogo(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleUpdateLogo(logoInput.trim())}
                className="flex-1 py-2.5 bg-gradient-to-tr from-indigo-600 to-indigo-750 hover:from-indigo-500 hover:to-indigo-600 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer"
              >
                Save Live Identity
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic atmospheric decoration background grids */}
      <div className="absolute top-0 left-0 right-0 h-[400px] bg-gradient-to-b from-indigo-500/5 via-[#0f172a]/2 to-[#0f172a] pointer-events-none" />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />

      {/* Persistent global app header */}
      <header className="sticky top-0 z-30 bg-[#0f172a]/80 backdrop-blur-md border-b border-slate-900/40 p-4 shrink-0">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                if (isCourseRep) {
                  setIsEditingLogo(true);
                }
              }}
              disabled={!isCourseRep}
              className={`relative flex items-center justify-center w-9 h-9 rounded-xl overflow-hidden outline-none ${
                isCourseRep 
                  ? 'cursor-pointer hover:scale-105 active:scale-95 transition-all group bg-gradient-to-tr from-amber-500 to-amber-600 shadow-[0_0_12px_rgba(245,158,11,0.3)]' 
                  : 'bg-gradient-to-tr from-indigo-500 to-violet-500 shadow-[0_0_12px_rgba(99,102,241,0.3)]'
              }`}
              title={isCourseRep ? "Click to change App Logo" : undefined}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <GraduationCap className="w-5 h-5 text-white" />
              )}
              {isCourseRep && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-[7px] text-white font-mono uppercase tracking-widest font-black">Edit</span>
                </div>
              )}
            </button>
            <div>
              <h1 className="text-xl font-display font-bold text-slate-100 tracking-tight leading-none font-sans">
                ICH100L
              </h1>
              <span className="text-[10px] font-mono font-medium text-slate-400">Class Board</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* User state preview badge inside header */}
            <div className="flex items-center gap-2 bg-slate-950/40 border border-slate-800/80 p-1.0 pr-3 rounded-2xl">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-sans font-bold select-none ${
                isCourseRep ? 'bg-gradient-to-tr from-amber-400 to-amber-600 text-slate-950 font-black' : 'bg-gradient-to-tr from-indigo-500 to-violet-600 text-white'
              }`}>
                {getInitials(currentUser.name)}
              </div>
              <div className="text-right">
                <p className="text-[9px] font-sans font-bold text-slate-200 truncate max-w-[65px]">
                  {currentUser.name}
                </p>
                <p className="text-[7px] font-mono text-slate-500 leading-none">
                  {isCourseRep ? 'Rep👑' : 'Student'}
                </p>
              </div>
            </div>

            {/* Bell Icon trigger in Header - far right edge */}
            <button
              onClick={() => setActiveTab('notifications' as any)}
              className={`relative p-2 rounded-xl transition-all cursor-pointer border ${
                activeTab === ('notifications' as any)
                  ? 'bg-indigo-600/35 border-indigo-500 text-white animate-none shadow-[0_0_12px_rgba(99,102,241,0.25)]'
                  : 'bg-slate-950/40 hover:bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Notices & Inbox"
            >
              <Bell className="w-4 h-4" />
              {notifications.some(n => !n.isRead) && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-rose-500 ring-1 ring-slate-950 animate-pulse" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Prime Core Scrollable workspace container */}
      <main className="flex-1 overflow-y-auto max-w-md mx-auto w-full px-4 pt-6 pb-32 z-10 no-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Course Repo Hovering floating plus trigger button */}
      {isCourseRep && ['schedule', 'deadlines', 'announcements'].includes(activeTab) && (
        <div className="fixed bottom-24 right-5 sm:right-1/2 sm:translate-x-48 z-40">
          <button
            onClick={() => {
              if (activeTab === 'schedule') {
                setAddingOrEditing({ type: 'schedule', editActivity: null });
              } else if (activeTab === 'deadlines') {
                setAddingOrEditing({ type: 'deadline' });
              } else if (activeTab === 'announcements') {
                setAddingOrEditing({ type: 'announcement' });
              }
            }}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-500 via-indigo-600 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white flex items-center justify-center p-0 transition-transform hover:scale-110 active:scale-95 shadow-[0_8px_32px_rgba(99,102,241,0.5)] cursor-pointer outline-none relative group"
            title={`Add item to ${activeTab === 'schedule' ? 'Schedules' : activeTab === 'deadlines' ? 'Deadlines' : 'Announcements'}`}
          >
            {/* Ambient dynamic pulse rings around button */}
            <span className="absolute inset-x-0 inset-y-0 rounded-full bg-indigo-500/30 animate-ping group-hover:block" />
            <Plus className="w-7 h-7" />
          </button>
        </div>
      )}

      {/* Global Interactive Bottom Menu bar */}
      <BottomNav
        currentTab={activeTab}
        onChangeTab={setActiveTab}
        isCourseRep={isCourseRep}
      />
    </div>
  );
}
