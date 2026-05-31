/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Calendar, Megaphone, User, Clock, Bell, ListChecks, CreditCard, BookOpen } from 'lucide-react';

export type TabType = 'schedule' | 'deadlines' | 'announcements' | 'modules' | 'subscription' | 'profile';

interface BottomNavProps {
  currentTab: TabType;
  onChangeTab: (tab: TabType) => void;
  isCourseRep: boolean;
  id?: string;
}

export default function BottomNav({ currentTab, onChangeTab, isCourseRep, id }: BottomNavProps) {
  const navItems = [
    {
      id: 'schedule' as TabType,
      label: 'Schedule',
      icon: Calendar,
    },
    {
      id: 'deadlines' as TabType,
      label: 'Deadlines',
      icon: Clock,
    },
    {
      id: 'announcements' as TabType,
      label: 'Broadcasts',
      icon: Megaphone,
    },
    {
      id: 'modules' as TabType,
      label: 'Modules',
      icon: BookOpen,
    },
    {
      id: 'profile' as TabType,
      label: 'Profile',
      icon: User,
    },
  ];

  return (
    <nav
      id={id || 'bottom-navigation'}
      className="fixed bottom-6 left-4 right-4 z-40 max-w-md mx-auto bg-slate-950/70 backdrop-blur-xl border border-slate-800/80 rounded-full px-5 py-0.5 shadow-[0_15px_35px_rgba(0,0,0,0.6)]"
    >
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChangeTab(item.id)}
              className="relative flex flex-col items-center justify-center py-1 px-2 transition-all duration-300 rounded-xl outline-none"
            >
              <div
                className={`flex items-center justify-center p-1.5 rounded-lg transition-all duration-300 ${
                  isActive
                    ? 'text-indigo-400 bg-indigo-500/10'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span
                className={`text-[9px] sm:text-[10px] mt-0.5 font-medium tracking-wide font-sans transition-colors duration-300 ${
                  isActive ? 'text-indigo-300' : 'text-slate-500'
                }`}
              >
                {item.label}
              </span>
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-indigo-400 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
