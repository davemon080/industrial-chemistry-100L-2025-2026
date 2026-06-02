/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  Send, 
  CheckCircle2, 
  Trash2, 
  Clock, 
  User, 
  Mail, 
  Sparkles, 
  ChevronRight, 
  AlertCircle, 
  ArrowLeft, 
  Loader2, 
  Star, 
  Check, 
  Inbox, 
  Filter,
  MessageCircle
} from 'lucide-react';
import GlassCard from './GlassCard';
import { db, getSafeDocId, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, updateDoc, onSnapshot } from 'firebase/firestore';

interface FeedbackItem {
  id: string;
  matricNumber: string;
  studentName: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
  status: 'unread' | 'read' | 'replied';
  rating?: number;
  adminReply?: string;
  repliedAt?: string;
}

interface FeedbackPageProps {
  user: {
    email: string;
    matricNumber: string;
    name: string;
    isAdmin?: boolean;
  };
  isAdminMode?: boolean;
  onBack?: () => void;
}

export default function FeedbackPage({
  user,
  isAdminMode = false,
  onBack
}: FeedbackPageProps) {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Student form states
  const [subject, setSubject] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(5);
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Admin and filtering states
  const [filterStatus, setFilterStatus] = useState<'all' | 'unread' | 'read' | 'replied'>('all');
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [adminReplyText, setAdminReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [replySuccess, setReplySuccess] = useState('');
  const [replyError, setReplyError] = useState('');

  const subjectOptions = [
    'General Inquiry',
    'Assignment / Test Query',
    'Faculty / Lecture Complaint',
    'Software Bug / Technical Issue',
    'Syllabus Suggestion',
    'Course Representative Review',
    'Other'
  ];

  // Fetch feedbacks on load and listen to live changes if database is initialized
  useEffect(() => {
    setIsLoading(true);
    let unsubscribe = () => {};

    try {
      // Load offline cache first
      const cached = localStorage.getItem('ich100l_feedbacks_db');
      if (cached) {
        setFeedbacks(JSON.parse(cached));
      }

      if (db) {
        unsubscribe = onSnapshot(collection(db, 'feedbacks'), (snapshot) => {
          const fetched: FeedbackItem[] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as FeedbackItem));

          // Sort descending by date
          fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          setFeedbacks(fetched);
          localStorage.setItem('ich100l_feedbacks_db', JSON.stringify(fetched));
          setIsLoading(false);
        }, (err) => {
          console.warn('[Feedback] Real-time listener offline fallback:', err);
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    } catch (e) {
      console.error('[Feedback] Initialization failed:', e);
      setIsLoading(false);
    }

    return () => unsubscribe();
  }, []);

  // Update selected feedback if active snapshot updates it
  useEffect(() => {
    if (selectedFeedback) {
      const updated = feedbacks.find(f => f.id === selectedFeedback.id);
      if (updated) {
        setSelectedFeedback(updated);
      }
    }
  }, [feedbacks]);

  // Handle student feedback submission
  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitSuccess('');
    setSubmitError('');
    setIsSubmitting(true);

    const finalSubject = subject === 'Other' ? (customSubject.trim() || 'Other') : subject;
    if (!finalSubject || !message.trim()) {
      setSubmitError('Please complete both the subject and your message details.');
      setIsSubmitting(false);
      return;
    }

    const feedbackId = `fb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newFeedback: FeedbackItem = {
      id: feedbackId,
      matricNumber: user.matricNumber || 'Guest',
      studentName: user.name || 'Chemistry Student',
      email: user.email || 'guest@ich100l.edu',
      subject: finalSubject,
      message: message.trim(),
      rating,
      createdAt: new Date().toISOString(),
      status: 'unread'
    };

    try {
      // 1. Submit online to Firestore
      if (db) {
        const docRef = doc(db, 'feedbacks', feedbackId);
        await setDoc(docRef, newFeedback);
      }

      // 2. Submit offline cache update
      const updatedFeedbacks = [newFeedback, ...feedbacks];
      setFeedbacks(updatedFeedbacks);
      localStorage.setItem('ich100l_feedbacks_db', JSON.stringify(updatedFeedbacks));

      setSubmitSuccess('Your feedback has been delivered securely to the Course Administrators.');
      setSubject('');
      setCustomSubject('');
      setMessage('');
      setRating(5);
    } catch (err: any) {
      console.error(err);
      try {
        handleFirestoreError(err, OperationType.CREATE, 'feedbacks');
      } catch (e: any) {
        setSubmitError(`Could not submit feedback online: ${e.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle admin reply to feedback
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFeedback) return;

    setReplySuccess('');
    setReplyError('');
    setIsReplying(true);

    if (!adminReplyText.trim()) {
      setReplyError('Reply message cannot be empty.');
      setIsReplying(false);
      return;
    }

    const updatedFeedback: Partial<FeedbackItem> = {
      status: 'replied',
      adminReply: adminReplyText.trim(),
      repliedAt: new Date().toISOString()
    };

    try {
      if (db) {
        const feedbackRef = doc(db, 'feedbacks', selectedFeedback.id);
        const completeUpdated = { ...selectedFeedback, ...updatedFeedback };
        await setDoc(feedbackRef, completeUpdated);
      }

      // Update in-memory and caches
      const finalFeedbacks = feedbacks.map(f => f.id === selectedFeedback.id ? { ...f, ...updatedFeedback } as FeedbackItem : f);
      setFeedbacks(finalFeedbacks);
      localStorage.setItem('ich100l_feedbacks_db', JSON.stringify(finalFeedbacks));

      setReplySuccess('Reply saved and message state updated to: Replied.');
      setAdminReplyText('');
    } catch (err: any) {
      console.error(err);
      setReplyError(err.message || 'Failed to update feedback reply states.');
    } finally {
      setIsReplying(false);
    }
  };

  // Mark a feedback item as read
  const handleMarkAsRead = async (item: FeedbackItem) => {
    if (item.status !== 'unread') return;
    
    try {
      const updatedItem: Partial<FeedbackItem> = { status: 'read' };
      if (db) {
        const docRef = doc(db, 'feedbacks', item.id);
        await updateDoc(docRef, updatedItem);
      }

      const finalFeedbacks = feedbacks.map(f => f.id === item.id ? { ...f, ...updatedItem } as FeedbackItem : f);
      setFeedbacks(finalFeedbacks);
      localStorage.setItem('ich100l_feedbacks_db', JSON.stringify(finalFeedbacks));
    } catch (err) {
      console.warn('Failed to mark as read:', err);
    }
  };

  // Handle delete feedback record
  const handleDeleteFeedback = async (id: string) => {
    if (!confirm('Are you sure you want to delete this feedback item? This is an irreversible operation.')) return;

    try {
      if (db) {
        await deleteDoc(doc(db, 'feedbacks', id));
      }

      const remainder = feedbacks.filter(f => f.id !== id);
      setFeedbacks(remainder);
      localStorage.setItem('ich100l_feedbacks_db', JSON.stringify(remainder));

      if (selectedFeedback && selectedFeedback.id === id) {
        setSelectedFeedback(null);
      }
    } catch (err) {
      console.error(err);
      alert('Could not delete feedback item online.');
    }
  };

  // Filter feedbacks for students vs admins
  const studentFeedbacks = feedbacks.filter(f => f.matricNumber === user.matricNumber);
  const activeFeedbacksList = isAdminMode 
    ? feedbacks.filter(f => filterStatus === 'all' ? true : f.status === filterStatus)
    : studentFeedbacks;

  // Stats summaries
  const totalReceived = feedbacks.length;
  const unreadCount = feedbacks.filter(f => f.status === 'unread').length;
  const repliedCount = feedbacks.filter(f => f.status === 'replied').length;

  return (
    <div className="space-y-6 pb-28">
      {/* Header section with back button if applicable */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2.5 bg-slate-950/80 hover:bg-slate-900 border border-slate-900 rounded-xl text-slate-400 hover:text-white transition-all cursor-pointer select-none"
            title="Go Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div>
          <h2 className="text-xl font-display font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-400 shrink-0" />
            <span>{isAdminMode ? 'Student Feedbacks Hub' : 'Feedback Desk'}</span>
          </h2>
          <p className="text-2xs text-slate-400 font-mono mt-0.5 uppercase tracking-wider">
            {isAdminMode 
              ? 'Synchronized channels for course queries & suggestions' 
              : 'Direct communication desk for help & reviews to administrators'}
          </p>
        </div>
      </div>

      {/* ADMIN HUB CONTROL DESK VIEW */}
      {isAdminMode ? (
        <div className="space-y-6">
          {/* Dashboard Metrics Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="glassmorphism p-4 rounded-xl border border-slate-850 bg-slate-950/40 relative overflow-hidden">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Total Queries</span>
              <p className="text-2xl font-display font-black text-slate-100 mt-1">{totalReceived}</p>
              <div className="absolute right-3 bottom-3 text-indigo-500/10"><Inbox className="w-8 h-8" /></div>
            </div>
            <div className="glassmorphism p-4 rounded-xl border border-slate-850 bg-slate-950/40 relative overflow-hidden">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Unread Pending</span>
              <p className="text-2xl font-display font-black text-amber-500 mt-1">{unreadCount}</p>
              <div className="absolute right-3 bottom-3 text-amber-500/10"><Clock className="w-8 h-8 animate-pulse" /></div>
            </div>
            <div className="glassmorphism p-4 rounded-xl border border-slate-850 bg-slate-950/40 relative overflow-hidden">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Replied Rate</span>
              <p className="text-2xl font-display font-black text-emerald-400 mt-1">
                {totalReceived > 0 ? `${Math.round((repliedCount / totalReceived) * 100)}%` : '100%'}
              </p>
              <div className="absolute right-3 bottom-3 text-emerald-500/10"><CheckCircle2 className="w-8 h-8" /></div>
            </div>
          </div>

          {/* Main layout split: feedbacks list on left, reply detail on right/modal */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            {/* Left side list of items */}
            <div className="md:col-span-7 space-y-4">
              {/* Filter Tabs Row */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-850 overflow-x-auto scrollbar-none">
                {(['all', 'unread', 'read', 'replied'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setFilterStatus(tab)}
                    className={`py-1.5 px-3 rounded-lg text-2xs font-mono font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${
                      filterStatus === tab 
                        ? 'bg-indigo-600 text-white shadow-md' 
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`}
                  >
                    {tab} ({tab === 'all' ? feedbacks.length : feedbacks.filter(f => f.status === tab).length})
                  </button>
                ))}
              </div>

              {/* Feedbacks cards stack */}
              <div className="space-y-3">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
                    <span className="text-xs font-mono">Syncing feedbacks dashboard...</span>
                  </div>
                ) : activeFeedbacksList.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-slate-850 rounded-2xl">
                    <Inbox className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-300">No feedbacks resolved</h3>
                    <p className="text-2xs text-slate-550 mt-1 leading-normal font-sans">
                      There are no student submissions corresponding to this filter tab right now.
                    </p>
                  </div>
                ) : (
                  activeFeedbacksList.map(item => (
                    <div
                      key={item.id}
                      onClick={async () => {
                        setSelectedFeedback(item);
                        setReplySuccess('');
                        setReplyError('');
                        if (item.status === 'unread') {
                          await handleMarkAsRead(item);
                        }
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 text-left relative overflow-hidden ${
                        selectedFeedback?.id === item.id
                          ? 'border-indigo-500 bg-indigo-950/10 shadow-[0_4px_20px_rgba(99,102,241,0.15)]'
                          : 'border-slate-850/80 bg-slate-900/10 hover:bg-slate-900/30 hover:border-slate-800'
                      }`}
                    >
                      {/* Left border indicator */}
                      <div className={`absolute top-0 bottom-0 left-0 w-1 ${
                        item.status === 'unread' 
                          ? 'bg-amber-500' 
                          : item.status === 'replied' 
                            ? 'bg-emerald-500' 
                            : 'bg-indigo-500'
                      }`} />

                      <div className="space-y-2.5 pl-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="text-xs font-extrabold text-slate-200 leading-snug">
                            {item.subject}
                          </h4>
                          <span className={`text-[8.5px] font-mono tracking-wide px-2 py-0.5 rounded border uppercase shrink-0 font-bold ${
                            item.status === 'unread'
                              ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 animate-pulse'
                              : item.status === 'replied'
                                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                                : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}>
                            {item.status}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-400 font-sans line-clamp-2 leading-relaxed">
                          {item.message}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-900 pt-2.5">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-[10px] font-sans">
                              {new Date(item.createdAt).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-450 font-mono flex items-center gap-1 text-slate-400">
                            <strong>{item.studentName}</strong> ({item.matricNumber})
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right side interaction card (reply / review terminal) */}
            <div className="md:col-span-5 h-full">
              {selectedFeedback ? (
                <GlassCard className="border border-slate-800 space-y-4 relative sticky top-6">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                      Query Inspection
                    </h3>
                    <button
                      onClick={() => setSelectedFeedback(null)}
                      className="text-2xs font-mono font-bold text-slate-550 hover:text-slate-350 cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  </div>

                  {/* Feedback summary */}
                  <div className="space-y-3.5 text-left text-xs">
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-905 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[10px]">
                        <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>Sender:</span>
                        <strong className="text-slate-200">{selectedFeedback.studentName}</strong>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[10px]">
                        <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>Email:</span>
                        <span className="text-slate-300 select-all font-sans">{selectedFeedback.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[10px]">
                        <AlertCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>Matric Number:</span>
                        <strong className="text-indigo-400 select-all">{selectedFeedback.matricNumber}</strong>
                      </div>
                      {selectedFeedback.rating !== undefined && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                          <span className="mr-1">User Rating:</span>
                          <div className="flex items-center">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3 h-3 ${
                                  s <= (selectedFeedback.rating || 5)
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-slate-800'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-200 font-mono">Subject Theme:</h4>
                      <div className="p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-500/20 text-indigo-200 text-2xs font-semibold uppercase tracking-wider">
                        {selectedFeedback.subject}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-100 font-mono">Student Message:</h4>
                      <p className="p-3 bg-slate-950/40 rounded-xl border border-slate-900 text-slate-300 text-xs leading-relaxed font-sans select-text whitespace-pre-wrap">
                        {selectedFeedback.message}
                      </p>
                    </div>

                    {/* Pre-existing replies */}
                    {selectedFeedback.adminReply && (
                      <div className="p-3.5 rounded-xl bg-emerald-950/15 border border-emerald-500/20 space-y-1.5 text-left">
                        <h5 className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                          <MessageCircle className="w-3.5 h-3.5 fill-emerald-500/20" />
                          Authorized Admin Response
                        </h5>
                        <p className="text-xs text-slate-300 leading-relaxed font-sans">
                          {selectedFeedback.adminReply}
                        </p>
                        {selectedFeedback.repliedAt && (
                          <div className="text-[9px] text-slate-500 font-mono text-right mt-1">
                            Answered: {new Date(selectedFeedback.repliedAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Write Response Panel */}
                    <form onSubmit={handleSendReply} className="space-y-3 pt-3 border-t border-slate-900">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                          Draft Reply / Correction Note
                        </label>
                        <textarea
                          rows={3}
                          required
                          value={adminReplyText}
                          onChange={(e) => setAdminReplyText(e.target.value)}
                          placeholder="Type response for student inbox..."
                          className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-xl text-xs text-slate-200 placeholder:text-slate-650 font-sans focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>

                      {replySuccess && (
                        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-2xs">
                          {replySuccess}
                        </div>
                      )}
                      
                      {replyError && (
                        <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-2xs">
                          {replyError}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={isReplying || !adminReplyText.trim()}
                          className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all"
                        >
                          {isReplying ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>Send Reply to Student</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteFeedback(selectedFeedback.id)}
                          className="p-2 bg-slate-950 hover:bg-rose-950/40 text-slate-500 hover:text-rose-400 border border-slate-900 hover:border-rose-500/30 rounded-xl transition-all cursor-pointer"
                          title="Purge Feedback"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </form>
                  </div>
                </GlassCard>
              ) : (
                <div className="p-8 border-2 border-dashed border-slate-850 rounded-2xl flex flex-col items-center justify-center text-center h-48">
                  <Inbox className="w-8 h-8 text-slate-600 mb-2" />
                  <h4 className="text-xs font-sans text-slate-400">No Query Selected</h4>
                  <p className="text-[10px] text-slate-550 max-w-[200px] mt-0.5">
                    Select a student feedback from the left column to read the complete entry and draft an official response.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* STANDARD STUDENT FEEDBACK VIEW */
        <div className="space-y-6 text-left">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Feedback form - left/main */}
            <div className="md:col-span-6">
              <GlassCard className="border border-slate-800 space-y-4">
                <div className="border-b border-slate-900 pb-3 flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-505/20 shrink-0">
                    <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                  </div>
                  <div>
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-100">
                      New Feedback Draft
                    </h3>
                    <p className="text-[10px] text-slate-405 font-sans mt-0.5">
                      Send bugs, suggestions or questions directly to class admins
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSubmitFeedback} className="space-y-4">
                  {submitSuccess && (
                    <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-2xs flex items-start gap-2 animate-fade-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{submitSuccess}</span>
                    </div>
                  )}

                  {submitError && (
                    <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-2xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-450 shrink-0 mt-0.5" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  {/* Subject selector */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-450 block">
                      Feedback Theme / Category
                    </label>
                    <select
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl py-2 px-3 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                    >
                      <option value="">-- Choose Category --</option>
                      {subjectOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  {subject === 'Other' && (
                    <div className="space-y-1 animate-fade-in">
                      <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-450 block">
                        Specify Subject Name
                      </label>
                      <input
                        type="text"
                        required
                        value={customSubject}
                        onChange={(e) => setCustomSubject(e.target.value)}
                        placeholder="Type subject custom label"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl py-2 px-3 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-650"
                      />
                    </div>
                  )}

                  {/* Rating selection */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-450 block">
                      Overall Portal Satisfaction
                    </label>
                    <div className="flex items-center gap-1.5 py-1">
                      {[1, 2, 3, 4, 5].map((starVal) => (
                        <button
                          type="button"
                          key={starVal}
                          onClick={() => setRating(starVal)}
                          className="p-1 focus:outline-none cursor-pointer group"
                        >
                          <Star
                            className={`w-5 h-5 transition-all duration-150 ${
                              starVal <= rating
                                ? 'text-amber-400 fill-amber-400 scale-105'
                                : 'text-slate-850 hover:text-slate-700'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="text-2xs text-slate-450 font-mono ml-2">
                        ({rating} / 5 stars)
                      </span>
                    </div>
                  </div>

                  {/* Core Message area */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-450 block">
                        Detailed Message
                      </label>
                      <span className="text-[9px] text-slate-550 font-mono uppercase">
                        {message.length} / 1000 chars
                      </span>
                    </div>
                    <textarea
                      rows={5}
                      required
                      maxLength={1000}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type details of your inquiry, complain, suggestions or feedback..."
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-650 leading-relaxed font-sans"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !subject || !message.trim()}
                    className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 disabled:opacity-50 text-white font-sans font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer border-none"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>{isSubmitting ? 'Delivering Inquiry...' : 'Transmit Feedback'}</span>
                  </button>
                </form>
              </GlassCard>
            </div>

            {/* Past feedbacks history / Admin inbox - right side */}
            <div className="md:col-span-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-350">
                  Transmissions Log ({studentFeedbacks.length})
                </h3>
              </div>

              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-400 mb-1.5" />
                  <span className="text-[10px] font-mono">Syncing transmission history...</span>
                </div>
              ) : studentFeedbacks.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-850 rounded-2xl bg-slate-950/10">
                  <Inbox className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <h4 className="text-xs font-semibold text-slate-400">No logs on file</h4>
                  <p className="text-[10px] text-slate-550 mt-1 max-w-[200px] mx-auto leading-normal font-sans">
                    Once you transmit feedback items, they will appear chronologically in this inbox log.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                  {studentFeedbacks.map((fb) => (
                    <div
                      key={fb.id}
                      className="p-4 rounded-xl border border-slate-850 bg-slate-950/20 text-left space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-xs font-bold text-slate-200 leading-snug">
                            {fb.subject}
                          </h4>
                          <div className="text-[9px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>{new Date(fb.createdAt).toLocaleString()}</span>
                          </div>
                        </div>

                        <span className={`text-[8px] font-mono font-bold tracking-wide px-2 py-0.5 rounded border uppercase shrink-0 ${
                          fb.status === 'unread'
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse'
                            : fb.status === 'replied'
                              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}>
                          {fb.status}
                        </span>
                      </div>

                      <p className="text-2xs text-slate-405 leading-relaxed font-sans whitespace-pre-wrap select-all">
                        {fb.message}
                      </p>

                      {fb.adminReply ? (
                        <div className="p-3 rounded-lg bg-indigo-950/15 border border-indigo-500/20 space-y-1 text-left animate-fade-in shadow-sm">
                          <h5 className="text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                            <MessageCircle className="w-3 h-3 text-indigo-500 fill-indigo-500/10" />
                            Official Administrator Reply
                          </h5>
                          <p className="text-2xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                            {fb.adminReply}
                          </p>
                        </div>
                      ) : (
                        <div className="text-[9px] text-slate-500 font-mono italic">
                          &bull; Waiting for Class representative review notification.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
