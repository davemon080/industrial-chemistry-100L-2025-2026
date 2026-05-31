/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Bell, Clock, Megaphone, Trash2, Check, ShieldAlert, Sparkles, Inbox, Smartphone, BellRing } from 'lucide-react';
import { Deadline, Announcement, Activity } from '../types';
import GlassCard from './GlassCard';

export interface NotificationItem {
  id: string;
  type: 'deadline' | 'announcement' | 'schedule';
  title: string;
  body: string;
  time: string; // e.g., "1 hour ago"
  isRead: boolean;
  priority: 'high' | 'medium' | 'info';
  referenceTab: 'schedule' | 'deadlines' | 'announcements';
}

interface NotificationsPageProps {
  deadlines: Deadline[];
  announcements: Announcement[];
  activities: Activity[];
  onBack: () => void;
  onNavigateToTab: (tab: 'schedule' | 'deadlines' | 'announcements') => void;
  notifications: NotificationItem[];
  onMarkAllAsRead: () => void;
  onToggleRead: (id: string) => void;
  onClearNotifications: () => void;
}

export default function NotificationsPage({
  deadlines,
  announcements,
  activities,
  onBack,
  onNavigateToTab,
  notifications,
  onMarkAllAsRead,
  onToggleRead,
  onClearNotifications
}: NotificationsPageProps) {
  
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const [permissionStatus, setPermissionStatus] = useState<string>('default');
  const [isIframe, setIsIframe] = useState<boolean>(false);
  const [testSent, setTestSent] = useState<boolean>(false);

  useEffect(() => {
    if (!('Notification' in window)) {
      setPermissionStatus('unsupported');
    } else {
      setPermissionStatus(Notification.permission);
    }

    try {
      setIsIframe(window.self !== window.top);
    } catch (e) {
      setIsIframe(true);
    }
  }, []);

  const handleRequestPermission = async () => {
    if (!('Notification' in window)) {
      alert('Your browser or platform does not support browser-level notifications.');
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermissionStatus(result);
    } catch (err) {
      console.error('Failed to request permission:', err);
    }
  };

  const handleTestNotification = () => {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      setTestSent(true);
      
      // Trigger instant notification
      new Notification('ICH 100L Alerts 🔔', {
        body: 'Connection established! Popup alerts are now enabled on your device.',
        icon: '/favicon.ico',
        tag: 'ich-test-notif'
      });

      // Reset test message state after a delay
      setTimeout(() => setTestSent(false), 4000);
    } else {
      handleRequestPermission();
    }
  };

  const handleOpenNewTab = () => {
    window.open(window.location.href, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex items-center justify-between border-b border-slate-900/40 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-slate-950/80 hover:bg-slate-900 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer border border-slate-900"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-display font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
              <Bell className="w-5 h-5 text-indigo-400" />
              <span>Inbox & Notices</span>
            </h2>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Updates on tests, assignments, and class bulletins
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <span className="text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-full animate-pulse">
            {unreadCount} Unread
          </span>
        )}
      </div>

      {/* Phone/Device Push Alert Controller Panel */}
      <GlassCard className="p-4 bg-gradient-to-br from-slate-900 via-indigo-950/10 to-slate-950 border-slate-850 text-left relative overflow-hidden">
        <div className="absolute right-0 top-0 w-32 h-32 rounded-full bg-indigo-505/5 blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
          <div className="space-y-1 flex-1">
            <h3 className="text-sm font-display font-extrabold text-slate-100 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-indigo-400" />
              <span>Lockscreen & Phone Alerts</span>
            </h3>
            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              Get instant popup notices on your phone when Course Reps schedule new classes, push timetable adjustments, or publish crucial deadlines.
            </p>

            {isIframe ? (
              <div className="p-2 rounded-lg bg-indigo-950/40 border border-indigo-500/20 text-[11px] text-slate-300 flex items-start gap-1.5 leading-normal mt-2.5">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-indigo-400" />
                <span>
                  <strong>Preview Note:</strong> Device popups require the app to run in its own tab. Click <strong>Open in New Tab</strong> to request permission.
                </span>
              </div>
            ) : permissionStatus === 'granted' ? (
              <div className="mt-2 text-emerald-400 text-[11px] font-sans flex items-center gap-1.5 bg-emerald-950/20 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Lockscreen popup alerts are active on this browser!</span>
              </div>
            ) : permissionStatus === 'denied' ? (
              <div className="mt-2 text-rose-400 text-[11px] font-sans flex items-center gap-1.5 bg-rose-950/25 border border-rose-500/20 px-2.5 py-1.5 rounded-lg w-fit">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>Blocked: Reset site permissions in your browser URL bar.</span>
              </div>
            ) : (
              <div className="mt-2 text-slate-400 text-[11px] font-sans flex items-center gap-1.5 bg-slate-950/40 border border-slate-800 px-2.5 py-1.5 rounded-lg w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                <span>Alerts status: Inactive</span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 w-full sm:w-auto">
            {isIframe ? (
              <button
                onClick={handleOpenNewTab}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 hover:shadow-[0_4px_16px_rgba(99,102,241,0.3)] border-none outline-none"
              >
                <Smartphone className="w-4 h-4" />
                <span>Open in New Tab</span>
              </button>
            ) : permissionStatus === 'granted' ? (
              <button
                onClick={handleTestNotification}
                disabled={testSent}
                className={`w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 border-none outline-none ${
                  testSent 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-indigo-600 hover:bg-indigo-505 text-white'
                }`}
              >
                <BellRing className="w-4 h-4" />
                <span>{testSent ? 'Sending alert...' : 'Send Test Alert'}</span>
              </button>
            ) : (
              <button
                onClick={handleRequestPermission}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-white text-slate-950 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 border-none outline-none"
              >
                <Bell className="w-4 h-4" />
                <span>Enable Alerts</span>
              </button>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Control Actions toolbar */}
      {notifications.length > 0 && (
        <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded-xl border border-slate-900">
          <button
            onClick={onMarkAllAsRead}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-505/10 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Mark all read</span>
          </button>

          <button
            onClick={onClearNotifications}
            className="text-xs font-semibold text-slate-500 hover:text-rose-400 px-3 py-1.5 rounded-lg hover:bg-rose-500/10 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear archives</span>
          </button>
        </div>
      )}

      {/* Main Stream Stack */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {notifications.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="py-16 text-center"
            >
              <GlassCard className="py-12 border-dashed border-slate-850 max-w-sm mx-auto flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-slate-950 flex items-center justify-center border border-slate-850 text-indigo-400 mb-4 shadow-inner">
                  <Inbox className="w-5 h-5" />
                </div>
                <h4 className="text-base font-display font-bold text-slate-200">Your tray is empty</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed font-sans px-4">
                  All caught up! No recent course reschedules, deadlines, or announcements published by representatives.
                </p>
              </GlassCard>
            </motion.div>
          ) : (
            notifications.map((item, idx) => {
              const Icon = 
                item.type === 'deadline' ? Clock : 
                item.type === 'announcement' ? Megaphone : Bell;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25, delay: idx * 0.04 }}
                >
                  <GlassCard
                    onClick={() => onToggleRead(item.id)}
                    className={`glassmorphism-hover relative transition-all duration-300 border-l-[3px] cursor-pointer ${
                      item.isRead 
                        ? 'opacity-65 border-slate-800/80 bg-slate-900/30' 
                        : item.priority === 'high' 
                        ? 'border-rose-500 bg-rose-500/5 shadow-[0_4px_16px_rgba(244,63,94,0.06)]' 
                        : 'border-indigo-500 bg-indigo-500/2 shadow-[0_4px_16px_rgba(99,102,241,0.06)]'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      {/* Sub-type icon container */}
                      <div className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 ${
                        item.isRead 
                          ? 'bg-slate-950 border-slate-850 text-slate-500' 
                          : item.priority === 'high' 
                          ? 'bg-rose-500/10 border-rose-505/20 text-rose-400' 
                          : 'bg-indigo-500/10 border-indigo-505/20 text-indigo-400'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>

                      {/* Info payload */}
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[9px] font-mono uppercase font-bold tracking-wider ${
                            item.priority === 'high' ? 'text-rose-400' : 'text-indigo-400'
                          }`}>
                            {item.type} {item.priority === 'high' && '• ALERT'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">{item.time}</span>
                        </div>

                        <h3 className={`text-sm font-display font-semibold ${
                          item.isRead ? 'text-slate-400' : 'text-slate-100'
                        }`}>
                          {item.title}
                        </h3>

                        <p className={`text-xs font-sans ${
                          item.isRead ? 'text-slate-500' : 'text-slate-300'
                        } leading-relaxed`}>
                          {item.body}
                        </p>

                        {/* Quick action redirect shortcut buttons */}
                        <div className="pt-2 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleRead(item.id);
                            }}
                            className={`text-[10px] uppercase tracking-wider font-bold transition-all ${
                              item.isRead ? 'text-slate-500' : 'text-emerald-400 hover:text-emerald-300'
                            }`}
                          >
                            {item.isRead ? 'Already Checked' : 'Mark as Read'}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleRead(item.id); // auto read
                              onNavigateToTab(item.referenceTab);
                            }}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider bg-indigo-505/10 px-2 py-0.5 rounded border border-indigo-505/10"
                          >
                            Open Details &rarr;
                          </button>
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Ambient tip board */}
      <GlassCard className="p-3.5 bg-slate-950/20 border-slate-900 flex items-start gap-2 max-w-md">
        <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
          Notifications are dynamically compiled whenever Course Representatives push class reschedules, assignment sheets or handouts. Read items are saved locally on this student device.
        </p>
      </GlassCard>
    </div>
  );
}
