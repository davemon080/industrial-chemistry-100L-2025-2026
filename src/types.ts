/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  email: string;
  matricNumber: string;
  name: string;
  isAdmin?: boolean;
  createdAt?: string;
}

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export type ActivityCategory = 'Lecture' | 'Lab' | 'Tutorial' | 'Exam' | 'Other';

export interface Activity {
  id: string;
  title: string;
  description?: string;
  timeStart: string; // e.g. "08:00"
  timeEnd: string;   // e.g. "10:00"
  day: DayOfWeek;
  location: string;
  courseCode: string; // e.g. "ICH 101" or "ICH 102"
  category: ActivityCategory;
  createdBy: string; // Matric number of creator
  deliveryType?: 'physical' | 'online';
  classLink?: string;
  date?: string; // e.g. "2026-06-03" (YYYY-MM-DD format)
}

export interface Deadline {
  id: string;
  title: string;
  courseCode: string;
  dueDate: string; // ISO Date String e.g. "2026-06-05"
  description?: string;
  isCompleted: boolean;
  createdBy: string; // Matric number of creator
  imageUrl?: string;
  imageUrls?: string[];
  completedBy?: Record<string, boolean>;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  date: string; // date string
  priority: 'high' | 'medium' | 'info';
  author: string; // e.g. "Course Rep" or "Dr. Adeyeri"
  imageUrl?: string;
  imageUrls?: string[];
}
