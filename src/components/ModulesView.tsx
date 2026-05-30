/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db, cleanData } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  Search, 
  ArrowLeft, 
  ExternalLink, 
  FileText, 
  Sparkles,
  Loader2,
  Calendar,
  AlertCircle,
  BookMarked,
  Download,
  Eye,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCw
} from 'lucide-react';
import GlassCard from './GlassCard';
import { motion, AnimatePresence } from 'motion/react';

export interface Course {
  id: string;
  courseCode: string;
  title: string;
  description?: string;
  createdBy: string;
  createdAt: string;
}

export interface PdfModule {
  id: string;
  title: string;
  pdfUrl: string;
  description?: string;
  uploadedAt: string;
  createdBy: string;
}

interface ModulesViewProps {
  isCourseRep: boolean;
  userMatric: string;
}

export default function ModulesView({ isCourseRep, userMatric }: ModulesViewProps) {
  // Realtime lists
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [currentModules, setCurrentModules] = useState<PdfModule[]>([]);

  // Search & Loading
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isLoadingModules, setIsLoadingModules] = useState(false);

  // Modal States
  const [isAddingCourse, setIsAddingCourse] = useState(false);
  const [isAddingModule, setIsAddingModule] = useState(false);

  // Source tab choice for creating a PDF ('file' vs 'url')
  const [addModuleSource, setAddModuleSource] = useState<'file' | 'url'>('file');

  // Inbuilt PDF Viewer State
  const [viewedPdf, setViewedPdf] = useState<PdfModule | null>(null);
  const [pdfjsLoaded, setPdfjsLoaded] = useState(false);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfRenderError, setPdfRenderError] = useState('');
  const [rotation, setRotation] = useState<number>(0);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = React.useRef<any>(null);

  // Dynamically load PDF.js from a CDN
  useEffect(() => {
    if ((window as any).pdfjsLib) {
      setPdfjsLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    script.async = true;
    script.onload = () => {
      const globalPdfjs = (window as any).pdfjsLib;
      if (globalPdfjs) {
        globalPdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        setPdfjsLoaded(true);
      }
    };
    script.onerror = () => {
      setPdfRenderError('Failed to load in-app PDF rendering engine. Please verify internet access.');
    };
    document.body.appendChild(script);
  }, []);

  // PDF Document Loader
  useEffect(() => {
    if (!viewedPdf) {
      setPdfDoc(null);
      setNumPages(null);
      setPageNumber(1);
      setRotation(0);
      setScale(1.2);
      setPdfRenderError('');
      return;
    }

    if (!pdfjsLoaded) return;

    let isCancelled = false;
    const loadPdfDoc = async () => {
      setPdfLoading(true);
      setPdfRenderError('');
      setNumPages(null);
      setPageNumber(1);

      try {
        const globalPdfjs = (window as any).pdfjsLib;
        if (!globalPdfjs) {
          throw new Error('PDF Engine is not loaded.');
        }

        const loadingTask = globalPdfjs.getDocument({
          url: viewedPdf.pdfUrl,
          withCredentials: false
        });
        
        const pdf = await loadingTask.promise;
        
        if (isCancelled) return;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
      } catch (err: any) {
        console.error('PDF.js download error:', err);
        if (isCancelled) return;
        setPdfRenderError(
          'Could not render PDF in-app dynamically. This might occur due to cross-origin resource rules (CORS) on remote links, or server sandbox boundaries.'
        );
      } finally {
        if (!isCancelled) {
          setPdfLoading(false);
        }
      }
    };

    loadPdfDoc();

    return () => {
      isCancelled = true;
    };
  }, [viewedPdf, pdfjsLoaded]);

  // Canvas Render Engine helper
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let isCancelled = false;
    const renderPage = async () => {
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }

        const page = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale, rotation });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Support high DPI screens
        const dpr = window.devicePixelRatio || 1;
        canvas.height = viewport.height * dpr;
        canvas.width = viewport.width * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.scale(dpr, dpr);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        renderTaskRef.current = null;
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Canvas draw error:', err);
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, pageNumber, scale, rotation]);

  // New Course Inputs
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [courseError, setCourseError] = useState('');

  // New Module Inputs
  const [newModTitle, setNewModTitle] = useState('');
  const [newModUrl, setNewModUrl] = useState('');
  const [newModDesc, setNewModDesc] = useState('');
  const [moduleError, setModuleError] = useState('');

  // Local PDF Device Upload State
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [pdfUploadError, setPdfUploadError] = useState('');

  // 1. Fetch all courses in real-time
  useEffect(() => {
    setIsLoadingCourses(true);
    const q = query(collection(db, 'courses'), orderBy('courseCode', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: Course[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Course);
      });
      setCourses(list);
      setIsLoadingCourses(false);
    }, (err) => {
      console.error('Error listening to courses:', err);
      setIsLoadingCourses(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Fetch modules for selected course
  useEffect(() => {
    if (!selectedCourse) {
      setCurrentModules([]);
      return;
    }

    setIsLoadingModules(true);
    const subColRef = collection(db, 'courses', selectedCourse.id, 'pdf-modules');
    const q = query(subColRef, orderBy('uploadedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snap) => {
      const list: PdfModule[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as PdfModule);
      });
      setCurrentModules(list);
      setIsLoadingModules(false);
    }, (err) => {
      console.error('Error listening to PDF modules:', err);
      setIsLoadingModules(false);
    });

    return () => unsubscribe();
  }, [selectedCourse]);

  // 3. Handle Add Course
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setCourseError('');

    const codeClean = newCode.trim().toUpperCase();
    const titleClean = newTitle.trim();
    if (!codeClean || !titleClean) {
      setCourseError('Course abbreviation and title are mandatory.');
      return;
    }

    try {
      const courseId = `course-${codeClean.replace(/[^A-Za-z0-9]/g, '-').toLowerCase()}-${Date.now().toString(36)}`;
      const newCourse: Course = {
        id: courseId,
        courseCode: codeClean,
        title: titleClean,
        description: newDesc.trim() || undefined,
        createdBy: userMatric,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'courses', courseId), cleanData(newCourse));
      
      // Reset inputs
      setNewCode('');
      setNewTitle('');
      setNewDesc('');
      setIsAddingCourse(false);
    } catch (err: any) {
      console.error('Save course error:', err);
      setCourseError('Firestore security policies rejected record write.');
    }
  };

  // 4. Handle Delete Course
  const handleDeleteCourse = async (courseId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm('Are you absolutely certain you want to delete this course and all its uploaded PDF resource syllabus notes?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'courses', courseId));
      if (selectedCourse?.id === courseId) {
        setSelectedCourse(null);
      }
    } catch (err) {
      console.error('Delete course error:', err);
    }
  };

  // 5. PDF File Selection Change (with 100MB constraint)
  const handlePdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfUploadError('');
    setIsUploadingPdf(true);

    const maxBytes = 100 * 1024 * 1024; // 100MB strictly enforced boundary
    if (file.size > maxBytes) {
      setPdfUploadError('The selected PDF file exceeds the 100MB class syllabus storage boundary limit.');
      setIsUploadingPdf(false);
      return;
    }

    // Append standard form body
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const resp = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setNewModUrl(data.url);
        if (!newModTitle) {
          const rawName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          setNewModTitle(rawName);
        }
      } else {
        setPdfUploadError(data.error || 'Failed to upload syllabus PDF to server.');
      }
    } catch (err) {
      console.error('Syllabus PDF file upload process failed: ', err);
      setPdfUploadError('Upload pipeline failure. Please retry.');
    } finally {
      setIsUploadingPdf(false);
    }
  };

  // 6. Handle Add PDF Module (combining file url or manual url)
  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    setModuleError('');

    if (!selectedCourse) return;

    const titleClean = newModTitle.trim();
    const urlClean = newModUrl.trim();
    
    if (!titleClean || !urlClean) {
      setModuleError('Syllabus Title and a valid PDF link or file upload is required.');
      return;
    }

    // Try basic URL verification
    if (!urlClean.startsWith('http://') && !urlClean.startsWith('https://') && !urlClean.startsWith('/')) {
      setModuleError('Please provide a secure absolute link starting with https:// or finish the file upload.');
      return;
    }

    try {
      const moduleId = `mod-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const newModule: PdfModule = {
        id: moduleId,
        title: titleClean,
        pdfUrl: urlClean,
        description: newModDesc.trim() || undefined,
        uploadedAt: new Date().toISOString(),
        createdBy: userMatric
      };

      await setDoc(doc(db, 'courses', selectedCourse.id, 'pdf-modules', moduleId), cleanData(newModule));

      // Reset fields
      setNewModTitle('');
      setNewModUrl('');
      setNewModDesc('');
      setIsAddingModule(false);
    } catch (err) {
      console.error('Save module error:', err);
      setModuleError('Firestore database rule blocks unauthorized additions.');
    }
  };

  // 7. Handle Delete PDF Module
  const handleDeleteModule = async (moduleId: string) => {
    if (!selectedCourse) return;
    if (!confirm('Remove this syllabus notes PDF module from the cloud directory?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'courses', selectedCourse.id, 'pdf-modules', moduleId));
    } catch (err) {
      console.error('Delete module error:', err);
    }
  };

  // Filter courses by searchable query
  const filteredCourses = courses.filter(c => 
    c.courseCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="py-1 animate-fadeIn flex flex-col h-full relative" id="modules-view-container">
      <AnimatePresence mode="wait">
        {!selectedCourse ? (
          // ----------------- LIST VIEW (COURSES) -----------------
          <motion.div
            key="courses-list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 flex flex-col"
          >
            {/* Curriculum Hub Header */}
            <div className="flex justify-between items-center bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl">
              <div>
                <h2 className="text-base font-display font-extrabold text-slate-100 flex items-center gap-2">
                  <BookMarked className="w-5 h-5 text-indigo-400" />
                  <span>Syllabus Modules</span>
                </h2>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5 font-sans leading-none">Explore peer references, handouts and notes archive</p>
              </div>
              
              {isCourseRep && (
                <button
                  onClick={() => setIsAddingCourse(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[10px] font-bold text-white transition-all shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-95 cursor-pointer outline-none"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Course</span>
                </button>
              )}
            </div>

            {/* Live Interactive Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search course abbreviation or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-950/40 border border-slate-800/70 rounded-2xl text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Courses Grid */}
            {isLoadingCourses ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                <Loader2 className="w-7 h-7 animate-spin text-indigo-500 mb-2" />
                <span className="text-xs font-sans">Connecting syllabus repository...</span>
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="text-center py-12 p-6 bg-slate-900/20 border border-slate-800/40 rounded-2xl text-slate-500 space-y-2">
                <AlertCircle className="w-7 h-7 text-slate-600 mx-auto" />
                <p className="text-xs font-semibold">No course records indexed</p>
                <p className="text-[10px] text-slate-500 max-w-[220px] mx-auto leading-normal">
                  {searchQuery ? 'Try adjusting search term filters' : 'Course Representative has not uploaded any curriculum index points yet.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 max-h-[500px] overflow-y-auto no-scrollbar pb-10">
                {filteredCourses.map((course) => (
                  <div key={course.id}>
                    <GlassCard
                      onClick={() => setSelectedCourse(course)}
                      className="p-4 border border-slate-850 hover:border-slate-800 transition-all cursor-pointer group hover:bg-slate-900/10 pointer-events-auto"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="space-y-1 text-left flex-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-mono font-extrabold text-indigo-400">
                              {course.courseCode}
                            </span>
                          </div>
                          <h3 className="text-xs font-display font-bold text-slate-100 group-hover:text-indigo-300 transition-colors">
                            {course.title}
                          </h3>
                          {course.description && (
                            <p className="text-[10px] text-slate-400 font-sans line-clamp-2 leading-relaxed">
                              {course.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isCourseRep && (
                            <button
                              onClick={(e) => handleDeleteCourse(course.id, e)}
                              className="p-1.5 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 rounded-lg text-rose-400 transition-colors cursor-pointer outline-none"
                              title="Delete Course Entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <span className="text-[10px] bg-slate-950 font-sans text-slate-400 group-hover:text-white px-2.5 py-1 rounded-xl border border-slate-800 font-bold transition-all">
                            Open Folder
                          </span>
                        </div>
                      </div>
                    </GlassCard>
                  </div>
                ))}
              </div>
            )}

            {/* Float Plus Button for adding a Course (Bottom Right FAB) */}
            {isCourseRep && (
              <div className="fixed bottom-24 right-5 sm:right-1/2 sm:translate-x-48 z-40">
                <button
                  onClick={() => setIsAddingCourse(true)}
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-750 hover:from-indigo-500 hover:to-indigo-650 border border-indigo-500/30 text-white shadow-lg shadow-indigo-500/25 active:scale-95 transition-all cursor-pointer outline-none"
                  title="Create Course Entry"
                  id="add-course-fab"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            )}
          </motion.div>
        ) : (
          // ----------------- DETAIL VIEW (Syllabus Files for selected Course) -----------------
          <motion.div
            key="course-details"
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Top Back Utility Navigation */}
            <div className="flex items-center justify-between border-b border-slate-850 pb-3">
              <button
                onClick={() => setSelectedCourse(null)}
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors duration-200 cursor-pointer p-1"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>All Courses</span>
              </button>
              
              <span className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider">
                CURRICULUM ARCHIVE
              </span>
            </div>

            {/* Core Course Specs Cover Card */}
            <GlassCard className="p-4 bg-gradient-to-tr from-slate-900/60 to-indigo-950/20 border-slate-850 text-left relative overflow-hidden">
              <div className="absolute right-0 top-0 w-24 h-24 rounded-full bg-indigo-500/5 blur-2xl pointer-events-none" />
              <div className="space-y-1.5">
                <span className="px-2.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-mono font-extrabold text-indigo-400 inline-block">
                  {selectedCourse.courseCode}
                </span>
                <h2 className="text-sm font-display font-extrabold text-slate-100">{selectedCourse.title}</h2>
                {selectedCourse.description && (
                  <p className="text-[10px] text-slate-400 font-sans leading-relaxed">{selectedCourse.description}</p>
                )}
              </div>
            </GlassCard>

            {/* Modules Section Header */}
            <div className="flex justify-between items-center bg-slate-900/40 border border-slate-850 p-3 rounded-xl">
              <div>
                <h4 className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider font-bold">
                  Available Files ({currentModules.length})
                </h4>
              </div>
              
              {isCourseRep && (
                <button
                  onClick={() => setIsAddingModule(true)}
                  className="flex items-center gap-1 px-3 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/20 rounded-xl text-[10px] font-bold text-amber-400 transition-all cursor-pointer outline-none"
                >
                  <Plus className="w-3 h-3" />
                  <span>Upload PDF</span>
                </button>
              )}
            </div>

            {/* Files catalog list */}
            {isLoadingModules ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
                <span className="text-[10px] font-sans">Connecting secure file indexes...</span>
              </div>
            ) : currentModules.length === 0 ? (
              <div className="text-center py-14 p-6 bg-slate-900/20 border border-slate-800/40 rounded-2xl text-slate-500 space-y-1.5">
                <FileText className="w-7 h-7 text-slate-600 mx-auto" />
                <p className="text-xs font-semibold">Folder is empty</p>
                <p className="text-[9px] text-slate-500 max-w-[200px] mx-auto leading-relaxed">
                  Course representatives upload direct peer PDF materials or relevant course notes.
                </p>
              </div>
            ) : (
              <div className="space-y-3 p-0.5 max-h-[380px] overflow-y-auto no-scrollbar pb-16">
                {currentModules.map((mod) => (
                  <div
                    key={mod.id}
                    className="p-3 bg-slate-900/30 hover:bg-slate-900/50 border border-slate-850 hover:border-slate-800 rounded-xl transition-all text-left flex items-start gap-3 relative group"
                  >
                    <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/15 text-rose-400 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-display font-bold text-slate-200 truncate pr-2">
                          {mod.title}
                        </h4>
                      </div>
                      
                      {mod.description && (
                        <p className="text-[10px] text-slate-400 font-sans leading-relaxed line-clamp-2">
                          {mod.description}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-1 text-[8px] font-mono text-slate-500">
                        <Calendar className="w-2.5 h-2.5 text-slate-600" />
                        <span>Uploaded {new Date(mod.uploadedAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-center">
                      {isCourseRep && (
                        <button
                          onClick={() => handleDeleteModule(mod.id)}
                          className="p-1.5 bg-rose-500/15 hover:bg-rose-500/30 rounded-lg text-rose-400 transition-colors cursor-pointer outline-none"
                          title="Delete PDF Module"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      
                      {/* INBUILT VIEWER BUTTON */}
                      <button
                        onClick={() => setViewedPdf(mod)}
                        className="p-1.5 bg-indigo-500/10 hover:bg-indigo-505/25 border border-indigo-500/20 rounded-lg text-indigo-400 transition-all flex items-center justify-center cursor-pointer pointer-events-auto"
                        title="View PDF In-app"
                        id={`view-pdf-btn-${mod.id}`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {/* DOWNLOAD BUTTON */}
                      <a
                        href={mod.pdfUrl}
                        download={`${mod.title}.pdf`}
                        className="p-1.5 bg-amber-500/10 hover:bg-amber-505/25 border border-amber-500/20 rounded-lg text-amber-400 transition-all flex items-center justify-center cursor-pointer pointer-events-auto"
                        title="Download Syllabus PDF"
                        id={`download-pdf-btn-${mod.id}`}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Float Plus Button for adding a Syllabus Note PDF (Bottom Right FAB) */}
            {isCourseRep && (
              <div className="fixed bottom-24 right-5 sm:right-1/2 sm:translate-x-48 z-40">
                <button
                  onClick={() => setIsAddingModule(true)}
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-550 border border-amber-500/30 text-white shadow-lg shadow-amber-500/25 active:scale-95 transition-all cursor-pointer outline-none"
                  title="Upload Syllabus PDF"
                  id="add-pdf-fab"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ----------------- MODAL Overlay: Add Course ----------------- */}
      {isAddingCourse && (
        <div className="fixed inset-0 bg-slate-950/90 z-[9999] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-2 border-b border-slate-850 pb-2.5 text-left">
              <BookOpen className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm font-display font-extrabold text-slate-100">Index New Curriculum Course</h3>
            </div>

            {courseError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-[10px] leading-relaxed flex items-start gap-2 text-left">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{courseError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCourse} className="space-y-3 text-left">
              <div className="space-y-1">
                <label className="text-[9px] uppercase font-mono tracking-wider text-slate-500 font-bold block">Course Abbr Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ICH 101, CHM 111"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase font-mono tracking-wider text-slate-500 font-bold block">Course Title Heading</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inorganic Chemistry Practice"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase font-mono tracking-wider text-slate-500 font-bold block">Core Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Basic stoichiometry theories, salt tests worksheets..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 outline-none focus:border-indigo-500 transition-colors resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingCourse(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-705 rounded-xl text-xs font-bold text-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-550 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer"
                >
                  Save Code
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL Overlay: Add PDF Module (With Local storage selection) ----------------- */}
      {isAddingModule && selectedCourse && (
        <div className="fixed inset-0 bg-slate-950/90 z-[9999] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 max-w-sm w-full shadow-2xl text-left">
            <div className="flex items-center gap-2 border-b border-slate-850 pb-2.5">
              <FileText className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-sm font-display font-extrabold text-slate-100">Upload Syllabus PDF</h3>
                <span className="text-[9px] font-mono text-slate-400 leading-none">Binding to {selectedCourse.courseCode}</span>
              </div>
            </div>

            {/* Input Selection Source Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/60">
              <button
                type="button"
                onClick={() => setAddModuleSource('file')}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold text-center transition-all cursor-pointer ${
                  addModuleSource === 'file' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Upload PDF File
              </button>
              <button
                type="button"
                onClick={() => setAddModuleSource('url')}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold text-center transition-all cursor-pointer ${
                  addModuleSource === 'url' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Provide Web URL
              </button>
            </div>

            {moduleError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-[10px] leading-relaxed flex items-start gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{moduleError}</span>
              </div>
            )}

            <form onSubmit={handleCreateModule} className="space-y-3">
              {addModuleSource === 'file' ? (
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-mono tracking-wider text-slate-500 font-bold block">Choose PDF file (Max 100MB)</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handlePdfFileChange}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950/50 border border-slate-800 text-slate-300 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-mono file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20 cursor-pointer"
                  />
                  {isUploadingPdf && (
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] text-indigo-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Uploading document file...</span>
                    </div>
                  )}
                  {pdfUploadError && (
                    <p className="text-[10px] text-rose-400 font-medium mt-1">⚠️ {pdfUploadError}</p>
                  )}
                  {newModUrl && (
                    <div className="flex items-center gap-1 text-[9px] text-emerald-400 mt-1 pointer-events-none">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>PDF successfully uploaded of size up to 100MB!</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-mono tracking-wider text-slate-500 font-bold block">Secure PDF URL / Link</label>
                  <input
                    type="text"
                    required
                    placeholder="https://drive.google.com/file/d/.../view"
                    value={newModUrl}
                    onChange={(e) => setNewModUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950/50 border border-slate-800 text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                  />
                  <span className="text-[8px] text-slate-500 block">
                    Paste Google Drive, Dropbox shared file link, or public web URL.
                  </span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[9px] uppercase font-mono tracking-wider text-slate-500 font-bold block">Document Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Volumetric Analysis Notes"
                  value={newModTitle}
                  onChange={(e) => setNewModTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950/50 border border-slate-800 text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase font-mono tracking-wider text-slate-500 font-bold block">Summary Description</label>
                <textarea
                  rows={2}
                  placeholder="Covers pipetting methods, indicator options, and molar calculations..."
                  value={newModDesc}
                  onChange={(e) => setNewModDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-955 border border-slate-800 text-slate-200 outline-none focus:border-indigo-500 transition-colors resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingModule(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-705 rounded-xl text-xs font-bold text-slate-300 transition-colors cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingPdf}
                  className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 rounded-xl text-xs font-bold text-slate-900 transition-colors cursor-pointer text-center"
                >
                  Confirm Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- INBUILT PDF INTERACTIVE VIEWER PANEL ----------------- */}
      {viewedPdf && (
        <div className="fixed inset-0 bg-slate-950/98 z-[9999] flex flex-col h-full animate-fadeIn" id="inbuilt-pdf-viewer">
          {/* Header Controls */}
          <div className="flex items-center justify-between p-3 border-b border-slate-850 bg-slate-900 shadow-md shrink-0">
            <div className="flex items-center gap-3 text-left min-w-0 flex-1">
              <button
                onClick={() => setViewedPdf(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-705 text-slate-300 transition-colors cursor-pointer outline-none shrink-0"
                title="Return to Syllabus Folder"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <h3 className="text-xs font-display font-extrabold text-slate-100 line-clamp-1">{viewedPdf.title}</h3>
                <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest font-black block">INBUILT SYLLABUS DIRECT READER</span>
              </div>
            </div>

            {/* Inbuilt Control Tools */}
            {pdfDoc && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-950/60 rounded-xl border border-slate-800 shrink-0">
                <button
                  onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                  disabled={pageNumber <= 1}
                  className="p-1 text-slate-400 hover:text-slate-100 disabled:opacity-30 cursor-pointer transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-mono text-slate-300">
                  Page {pageNumber} of {numPages}
                </span>
                <button
                  onClick={() => setPageNumber(p => Math.min(numPages || 1, p + 1))}
                  disabled={pageNumber >= (numPages || 1)}
                  className="p-1 text-slate-400 hover:text-slate-100 disabled:opacity-30 cursor-pointer transition-colors"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="w-px h-3 bg-slate-800 mx-1" />
                <button
                  onClick={() => setScale(s => Math.max(0.6, s - 0.2))}
                  className="p-1 text-slate-400 hover:text-slate-100 cursor-pointer transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setScale(s => Math.min(2.5, s + 0.2))}
                  className="p-1 text-slate-400 hover:text-slate-100 cursor-pointer transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setRotation(r => (r + 90) % 360)}
                  className="p-1 text-slate-400 hover:text-slate-100 cursor-pointer transition-colors"
                  title="Rotate Document Clockwise"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <a
                href={viewedPdf.pdfUrl}
                download={`${viewedPdf.title}.pdf`}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[10px] font-bold text-white transition-colors cursor-pointer"
                title="Download document to local storage"
              >
                <Download className="w-3 h-3" />
                <span>Save Note</span>
              </a>
            </div>
          </div>

          {/* Core Interactive Reader View */}
          <div className="flex-1 w-full bg-slate-950 overflow-auto flex flex-col items-center p-4 relative no-scrollbar">
            {pdfLoading && (
              <div className="absolute inset-0 bg-slate-950/80 z-20 flex flex-col items-center justify-center p-4">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-2.5" />
                <p className="text-xs font-display font-medium text-slate-200">Processing vector elements...</p>
                <p className="text-[10px] text-slate-500 font-sans mt-1">Drawing document pages in high-resolution canvas...</p>
              </div>
            )}

            {pdfRenderError ? (
              <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl text-center space-y-4 my-auto">
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 inline-block">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-display font-bold text-slate-100">CORS / Secure Link Policy Safeguard</h4>
                <p className="text-xs text-slate-400 font-sans leading-relaxed">
                  To ensure complete viewing offline or handling strict browser privacy rules, you can read the document beautifully using standard fallbacks below.
                </p>
                <div className="flex flex-col gap-2 pt-2">
                  <a
                    href={viewedPdf.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-505 rounded-xl text-xs font-bold text-white transition-all inline-block cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in New Browser Tab</span>
                  </a>
                  <a
                    href={viewedPdf.pdfUrl}
                    download={`${viewedPdf.title}.pdf`}
                    className="w-full py-2 bg-slate-805 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-300 transition-all inline-block cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download file to local device</span>
                  </a>
                </div>
              </div>
            ) : (
              /* Canvas Drawing Target */
              <div className="flex-1 flex flex-col items-center justify-start py-4">
                <div className="bg-slate-900 p-2.5 rounded-2xl border border-slate-800/80 shadow-2xl flex items-center justify-center overflow-auto max-w-full">
                  <canvas ref={canvasRef} className="shadow-lg max-w-full rounded-lg bg-white" />
                </div>

                {/* Mobile Extra Navigation Overlay */}
                {pdfDoc && (
                  <div className="flex sm:hidden items-center justify-center gap-3 mt-4 bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl">
                    <button
                      onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                      disabled={pageNumber <= 1}
                      className="p-1 text-slate-400 hover:text-slate-100 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] font-mono text-slate-300">
                      Page {pageNumber} of {numPages}
                    </span>
                    <button
                      onClick={() => setPageNumber(p => Math.min(numPages || 1, p + 1))}
                      disabled={pageNumber >= (numPages || 1)}
                      className="p-1 text-slate-400 hover:text-slate-100 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
