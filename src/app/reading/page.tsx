"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Trash2, History, BookOpen, CheckCircle2, ChevronRight, Clock, Edit2, Search, Filter, RotateCcw, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { format, isWithinInterval, parseISO } from "date-fns";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { 
  Book, ReadingLog, 
  saveBook, deleteBook, 
  saveReadingLog
} from "@/lib/firebase/db";

export default function ReadingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { dict } = useLanguage();
  
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [readingLogs, setReadingLogs] = useState<ReadingLog[]>([]);
  
  const [showAddBook, setShowAddBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [showLogInput, setShowLogInput] = useState(false);
  const [logHours, setLogHours] = useState(0);
  const [logMinutes, setLogMinutes] = useState(0);
  const [editLogId, setEditLogId] = useState<string | null>(null);
  
  const [localProgress, setLocalProgress] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Edit Book state
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [editBookTitle, setEditBookTitle] = useState("");
  const [editBookEndDate, setEditBookEndDate] = useState("");

  // 1. Real-time Books Sync
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `users/${user.uid}/books`));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Book));
      setBooks(data);
      setLoading(false);
      
      // Sync localProgress: If server value matches local intent, clear the local intent
      setLocalProgress(prev => {
        const next = { ...prev };
        let changed = false;
        data.forEach(book => {
          if (next[book.id] !== undefined && next[book.id] === book.progress) {
            delete next[book.id];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    });
    return () => unsub();
  }, [user]);

  // 2. Real-time Reading Logs Sync for the selected book
  useEffect(() => {
    if (!user || !selectedBook) {
      setReadingLogs([]);
      return;
    }
    const q = query(
      collection(db, `users/${user.uid}/readingLogs`),
      where("bookId", "==", selectedBook.id)
    );
    const unsub = onSnapshot(q, (snap) => {
       const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReadingLog));
       setReadingLogs(logs);
    });
    return () => unsub();
  }, [user, selectedBook?.id]);

  const handleAddBook = async () => {
    if (!user || !newBookTitle.trim()) return;
    const newBook: Omit<Book, 'id'> = {
      title: newBookTitle.trim(),
      status: 'reading',
      progress: 0,
      startDate: format(new Date(), "yyyy-MM-dd"),
    };
    const id = await saveBook(user.uid, newBook);
    // onSnapshot will update the list
    setNewBookTitle("");
    setShowAddBook(false);
  };

  const handleUpdateProgress = async (book: Book, progress: number) => {
    if (!user) return;
    const { id, ...data } = book;
    const updateData: any = { ...data, progress };
    
    if (progress >= 100) {
      updateData.status = 'finished';
      updateData.endDate = format(new Date(), "yyyy-MM-dd");
    } else {
      updateData.status = 'reading';
      updateData.endDate = ""; // Use empty string to clear previous date
    }
    await saveBook(user.uid, updateData, book.id);
  };

  const handleSaveLog = async () => {
    if (!user || !selectedBook) return;
    const durationMins = logHours * 60 + logMinutes;
    if (durationMins <= 0) return;

    const log: Omit<ReadingLog, 'id' | 'createdAt'> = {
      bookId: selectedBook.id,
      date: format(new Date(), "yyyy-MM-dd"),
      durationMins,
    };
    await saveReadingLog(user.uid, log, editLogId || undefined);
    setShowLogInput(false);
    setEditLogId(null);
    setLogHours(0);
    setLogMinutes(0);
  };

  const handleBookClick = (book: Book) => {
    setSelectedBook(book);
  };

  const handleDeleteBook = async (id: string) => {
    if (!user || !confirm("この本を削除してもよろしいですか？記録も失われます。")) return;
    await deleteBook(user.uid, id);
    if (selectedBook?.id === id) setSelectedBook(null);
  };

  const handleDeleteLog = async (logId: string) => {
    if (!user || !confirm("この読書記録を削除しますか？")) return;
    const { deleteReadingLog } = await import("@/lib/firebase/db");
    await deleteReadingLog(user.uid, logId);
  };

  const handleUpdateBookMeta = async () => {
    if (!user || !editingBook) return;
    const updatedBook = { 
      ...editingBook, 
      title: editBookTitle,
      endDate: editingBook.status === 'finished' ? editBookEndDate : undefined
    };
    await saveBook(user.uid, updatedBook, editingBook.id);
    setEditingBook(null);
  };

  const handleRevertToReading = async (book: Book) => {
    if (!user || !confirm(dict.daily.revertConfirm)) return;
    const { id, ...data } = book;
    const updateData: any = { 
      ...data, 
      status: 'reading', 
      progress: 99, 
      endDate: "" // Clear completion date explicitly
    };
    await saveBook(user.uid, updateData, id);
    setLocalProgress(prev => ({ ...prev, [id]: 99 }));
  };

  if (loading) return <div className="p-10 text-center animate-pulse">Loading...</div>;

  // Apply filters
  const filteredBooks = books.filter(book => {
    const matchesSearch = book.title.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesDate = true;
    if (startDateFilter || endDateFilter) {
      const bookDate = parseISO(book.startDate);
      const start = startDateFilter ? parseISO(startDateFilter) : new Date(0);
      const end = endDateFilter ? parseISO(endDateFilter) : new Date(8640000000000000);
      matchesDate = isWithinInterval(bookDate, { start, end });
    }
    
    return matchesSearch && matchesDate;
  });

  const readingBooks = filteredBooks.filter(b => b.status === 'reading');
  const finishedBooks = filteredBooks.filter(b => b.status === 'finished');

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-32">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 hover:bg-muted rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-2xl font-bold">{dict.daily.readingTracker}</h1>
        </div>
        <button 
          onClick={() => setShowAddBook(true)}
          className="bg-primary text-white p-2 rounded-full shadow-lg hover:scale-105 transition-all"
        >
          <Plus size={24} />
        </button>
      </header>

      {/* Filter Bar */}
      <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center p-2 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input 
              type="text"
              placeholder={dict.daily.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-muted/30 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2.5 rounded-xl transition-all ${showFilters ? 'bg-primary text-white shadow-md' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}
          >
            <Filter size={20} />
          </button>
          {(searchQuery || startDateFilter || endDateFilter) && (
            <button 
              onClick={() => { setSearchQuery(""); setStartDateFilter(""); setEndDateFilter(""); }}
              className="p-2.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
            >
              <X size={20} />
            </button>
          )}
        </div>
        
        {showFilters && (
          <div className="p-4 border-t border-border bg-slate-50/50 flex flex-wrap gap-4 animate-in slide-in-from-top-2 duration-200">
            <div className="flex-1 min-w-[140px] space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{dict.daily.filterStartDate}</label>
              <input 
                type="date" value={startDateFilter} onChange={(e) => setStartDateFilter(e.target.value)}
                className="w-full bg-white border border-border rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div className="flex-1 min-w-[140px] space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{dict.daily.filterEndDate}</label>
              <input 
                type="date" value={endDateFilter} onChange={(e) => setEndDateFilter(e.target.value)}
                className="w-full bg-white border border-border rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Book List Section */}
        <div className="space-y-6">
          <section>
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <BookOpen size={20} className="text-primary" />
              {dict.daily.readingStatus.reading}
            </h2>
            <div className="space-y-3">
              {readingBooks.length === 0 && <p className="text-sm text-balance text-muted-foreground bg-muted/20 p-4 rounded-xl text-center">現在読んでいる本はありません</p>}
              {readingBooks.map(book => (
                <div 
                  key={book.id} 
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${selectedBook?.id === book.id ? 'bg-primary/5 border-primary ring-1 ring-primary' : 'bg-white border-border hover:border-primary/50'}`}
                  onClick={() => handleBookClick(book)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold flex-1">{book.title}</h3>
                    <div className="flex gap-2">
                       <button onClick={(e) => { e.stopPropagation(); setShowLogInput(true); setSelectedBook(book); }} className="text-primary hover:bg-primary/10 p-1 rounded">
                         <Plus size={18} />
                       </button>
                       <button onClick={(e) => { e.stopPropagation(); handleDeleteBook(book.id); }} className="text-muted-foreground hover:text-red-500 p-1 rounded">
                         <Trash2 size={18} />
                       </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-muted-foreground">
                      <span>{dict.daily.progress}</span>
                      <span>{localProgress[book.id] ?? book.progress}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" 
                      value={localProgress[book.id] ?? book.progress} 
                      onChange={(e) => setLocalProgress(prev => ({ ...prev, [book.id]: Number(e.target.value) }))}
                      onPointerUp={() => {
                        handleUpdateProgress(book, localProgress[book.id] ?? book.progress);
                        // Don't delete immediately; wait for onSnapshot to confirm sync
                      }}
                      className="w-full h-3 bg-muted rounded-full appearance-none outline-none cursor-pointer accent-primary"
                      style={{
                        backgroundImage: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${localProgress[book.id] ?? book.progress}%, transparent ${localProgress[book.id] ?? book.progress}%, transparent 100%)`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <CheckCircle2 size={20} className="text-green-500" />
              {dict.daily.readingStatus.finished}
            </h2>
            <div className="space-y-3 opacity-80">
              {finishedBooks.length === 0 && <p className="text-sm text-muted-foreground bg-muted/10 p-4 rounded-xl text-center">まだ読了した本はありません</p>}
              {finishedBooks.map(book => (
                <div 
                  key={book.id} 
                  className={`p-4 rounded-2xl border bg-white border-border hover:border-primary/50 cursor-pointer transition-all ${selectedBook?.id === book.id ? 'ring-2 ring-primary/40' : ''}`}
                  onClick={() => handleBookClick(book)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-medium line-through decoration-muted-foreground/30 mb-1">{book.title}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">{book.endDate}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleRevertToReading(book); }} 
                        title={dict.daily.revertToReading}
                        className="text-muted-foreground hover:text-primary p-2 hover:bg-primary/5 rounded-lg transition-colors"
                      >
                        <RotateCcw size={16} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditingBook(book); setEditBookTitle(book.title); setEditBookEndDate(book.endDate || ""); }} 
                        className="text-muted-foreground hover:text-primary p-2 hover:bg-primary/5 rounded-lg transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteBook(book.id); }} 
                        className="text-muted-foreground hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* History / Detail Section */}
        <div className="space-y-6">
          <section className="bg-white border border-border rounded-3xl p-6 min-h-[400px] flex flex-col shadow-sm">
            {selectedBook ? (
              <>
                <div className="border-b border-border pb-4 mb-6">
                  <h2 className="text-xl font-extrabold text-foreground">{selectedBook.title}</h2>
                  <div className="flex gap-4 mt-2 text-xs font-bold text-muted-foreground">
                    <span>{dict.daily.startDate}: {selectedBook.startDate}</span>
                    {selectedBook.endDate && <span>{dict.daily.endDate}: {selectedBook.endDate}</span>}
                  </div>
                </div>

                <h3 className="text-sm font-bold flex items-center gap-2 mb-4 text-muted-foreground uppercase tracking-wider">
                  <History size={16} />
                  {dict.daily.history}
                </h3>

                <div className="flex-1 space-y-4 overflow-y-auto max-h-[400px] pr-2">
                  {readingLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                      <Clock size={32} className="opacity-20" />
                      <p className="text-sm">{dict.daily.noHistory}</p>
                    </div>
                  ) : (
                    readingLogs.sort((a,b) => b.date.localeCompare(a.date)).map(log => (
                      <div key={log.id} className="group flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-transparent hover:border-border transition-all">
                        <div className="flex-1">
                          <div className="font-bold text-sm">{log.date}</div>
                          <div className="text-primary font-black text-lg">
                            {Math.floor(log.durationMins / 60)}h {log.durationMins % 60}m
                          </div>
                        </div>
                        <div className="flex gap-1 transition-opacity">
                          <button 
                            onClick={() => {
                              setEditLogId(log.id);
                              setLogHours(Math.floor(log.durationMins / 60));
                              setLogMinutes(log.durationMins % 60);
                              setShowLogInput(true);
                            }}
                            className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteLog(log.id)}
                            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-4 text-center">
                <BookOpen size={48} className="opacity-10" />
                <p className="text-sm font-medium">本を選択して履歴を確認してください</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Add Book Modal */}
      {showAddBook && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-6">{dict.daily.addBook}</h2>
            <input 
              type="text" value={newBookTitle} onChange={(e) => setNewBookTitle(e.target.value)}
              placeholder={dict.daily.bookTitle}
              className="w-full bg-muted/30 border border-border rounded-xl p-4 mb-6 focus:ring-2 focus:ring-primary/20 outline-none font-medium"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setShowAddBook(false)} className="flex-1 py-3 font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all">キャンセル</button>
              <button onClick={handleAddBook} className="flex-1 py-3 font-bold bg-primary text-white rounded-xl shadow-lg hover:brightness-110 transition-all">追加</button>
            </div>
          </div>
        </div>
      )}

      {/* Log Input Modal */}
      {showLogInput && selectedBook && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-lg font-bold mb-2">{editLogId ? "記録の編集" : "読書時間を入力"}</h2>
            <p className="text-xs font-bold text-primary mb-6 truncate">{selectedBook.title}</p>
            
            <div className="flex gap-4 mb-8">
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">{dict.daily.hours}</label>
                <select 
                  value={logHours} onChange={(e) => setLogHours(Number(e.target.value))}
                  className="w-full bg-muted/30 border border-border rounded-xl p-3 font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  {[...Array(24)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">{dict.daily.minutes}</label>
                <select 
                  value={logMinutes} onChange={(e) => setLogMinutes(Number(e.target.value))}
                  className="w-full bg-muted/30 border border-border rounded-xl p-3 font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                >
                   {[...Array(12)].map((_, i) => <option key={i*5} value={i*5}>{i*5}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setShowLogInput(false); setEditLogId(null); }} className="flex-1 py-3 font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all">キャンセル</button>
              <button onClick={handleSaveLog} className="flex-1 py-3 font-bold bg-primary text-white rounded-xl shadow-lg hover:brightness-110 transition-all">{editLogId ? "更新する" : "記録する"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Book Modal */}
      {editingBook && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-6">{dict.daily.editBook}</h2>
            
            <div className="space-y-4 mb-8">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase">{dict.daily.bookTitle}</label>
                <input 
                  type="text" value={editBookTitle} onChange={(e) => setEditBookTitle(e.target.value)}
                  className="w-full bg-muted/30 border border-border rounded-xl p-4 focus:ring-2 focus:ring-primary/20 outline-none font-medium"
                />
              </div>

              {editingBook.status === 'finished' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase">{dict.daily.endDate}</label>
                  <input 
                    type="date" value={editBookEndDate} onChange={(e) => setEditBookEndDate(e.target.value)}
                    className="w-full bg-muted/30 border border-border rounded-xl p-4 focus:ring-2 focus:ring-primary/20 outline-none font-medium"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEditingBook(null)} className="flex-1 py-3 font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all">キャンセル</button>
              <button onClick={handleUpdateBookMeta} className="flex-1 py-3 font-bold bg-primary text-white rounded-xl shadow-lg hover:brightness-110 transition-all">保存する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
