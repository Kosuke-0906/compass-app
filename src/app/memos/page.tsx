"use client";

import { useState, useEffect } from "react";
import { format, subDays } from "date-fns";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { 
  PenTool, Search, Tag, Edit2, Trash2, Settings2, Star, Pin, X, Plus, Save, Loader2, Bookmark, CalendarDays, ChevronRight
} from "lucide-react";
import { collection, query, onSnapshot, orderBy, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { 
  saveMemo, 
  deleteMemo, 
  saveMemoTag, 
  deleteMemoTag, 
  Memo, 
  MemoTag 
} from "@/lib/firebase/db";

const PALETTE_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", 
  "#84cc16", "#22c55e", "#10b981", "#14b8a6", 
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", 
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e", 
  "#64748b"
];

export default function MemosPage() {
  const { dict } = useLanguage();
  const { user } = useAuth();
  
  const [memos, setMemos] = useState<Memo[]>([]);
  const [tags, setTags] = useState<MemoTag[]>([]);
  const [loading, setLoading] = useState(true);

  // States for filtering & UI
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  // Date range filtering
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [quickDateFilter, setQuickDateFilter] = useState<string | null>(null); // 'today', 'week', 'month'

  // States for Tag Management Modal
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Partial<MemoTag> | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(PALETTE_COLORS[0]);

  // States for Memo Input
  const [inputMemoText, setInputMemoText] = useState("");
  const [inputMemoTags, setInputMemoTags] = useState<string[]>([]); // tag IDs
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch Data (Realtime)
  useEffect(() => {
    if (!user) return;
    
    // 1. メモの取得 (orderByなしで取得してメモリ内でソートすることでインデックスエラーを防ぎ、読み込みを最速化)
    const qMemos = query(collection(db, `users/${user.uid}/memos`));
    const unsubscribeMemos = onSnapshot(
      qMemos, 
      (snapshot) => {
        const fetchedMemos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Memo));
        setMemos(fetchedMemos);
        setLoading(false);
      },
      (error) => {
        console.error("Memo fetch error:", error);
        setLoading(false); // エラー時もくるくるを止める
      }
    );

    // 2. タグの取得
    const qTags = query(collection(db, `users/${user.uid}/memoTags`));
    const unsubscribeTags = onSnapshot(
      qTags, 
      (snapshot) => {
        const fetchedTags = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MemoTag));
        setTags(fetchedTags);
      },
      (error) => {
        console.error("Tag fetch error:", error);
      }
    );

    return () => {
      unsubscribeMemos();
      unsubscribeTags();
    };
  }, [user]);

  // Actions
  const handleSaveMemo = async () => {
    if (!user || !inputMemoText.trim()) return;
    setIsSaving(true);
    try {
      const memoData: Partial<Memo> = {
        text: inputMemoText,
        date: new Date().toLocaleDateString(), 
        tags: inputMemoTags,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(), // 同期ズレを防ぐためここもサーバー時刻に統一
      };
      
      // 既存のメモを編集している場合
      if (editingMemoId) {
        const existing = memos.find(m => m.id === editingMemoId);
        if (existing) {
          memoData.isFavorite = existing.isFavorite;
          memoData.isPinned = existing.isPinned;
          memoData.createdAt = existing.createdAt || serverTimestamp(); // 作成日時は維持
        }
      } else {
        memoData.isFavorite = false;
        memoData.isPinned = false;
      }

      await saveMemo(user.uid, memoData as Omit<Memo, 'id'>, editingMemoId || undefined);
      setInputMemoText("");
      setInputMemoTags([]);
      setEditingMemoId(null);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("Save Error:", err);
      alert("保存中にエラーが発生しました: " + errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleFavorite = async (memo: Memo) => {
    if (!user) return;
    const { id, ...rest } = memo;
    await saveMemo(user.uid, { ...rest, isFavorite: !memo.isFavorite }, memo.id);
  };

  const handleTogglePin = async (memo: Memo) => {
    if (!user) return;
    const { id, ...rest } = memo;
    await saveMemo(user.uid, { ...rest, isPinned: !memo.isPinned }, memo.id);
  };

  const handleDeleteMemo = async (memoId: string) => {
    if (!user || !confirm("本当に削除しますか？")) return;
    await deleteMemo(user.uid, memoId);
  };

  const handleEditMemo = (memo: Memo) => {
    setInputMemoText(memo.text);
    setInputMemoTags(memo.tags);
    setEditingMemoId(memo.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Tag Management Actions
  const handleSaveTag = async () => {
    if (!user || !newTagName.trim()) return;
    try {
      await saveMemoTag(user.uid, { name: newTagName, color: newTagColor }, editingTag?.id);
      setEditingTag(null);
      setNewTagName("");
      setNewTagColor(PALETTE_COLORS[0]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!user || !confirm("タグを削除しますか？")) return;
    await deleteMemoTag(user.uid, tagId);
  };

  // Quick Date Filter Handlers
  const handleQuickDateFilter = (filter: string) => {
    const now = new Date();
    let start = "";
    const end = format(now, 'yyyy-MM-dd');

    if (filter === 'today') {
      start = end;
    } else if (filter === 'week') {
      const lastWeek = subDays(now, 7);
      start = format(lastWeek, 'yyyy-MM-dd');
    } else if (filter === 'month') {
      const lastMonth = subDays(now, 30);
      start = format(lastMonth, 'yyyy-MM-dd');
    }

    setStartDate(start);
    setEndDate(end);
    setQuickDateFilter(filter);
  };

  const clearDateFilter = () => {
    setStartDate("");
    setEndDate("");
    setQuickDateFilter(null);
  };

  // Filtering Logic & Sorting
  let filteredMemos = memos;
  if (activeTagId) {
    filteredMemos = filteredMemos.filter(m => m.tags.includes(activeTagId));
  }
  if (showFavoritesOnly) {
    filteredMemos = filteredMemos.filter(m => m.isFavorite);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filteredMemos = filteredMemos.filter(m => m.text.toLowerCase().includes(q));
  }

  // Date Range Filtering
  if (startDate || endDate) {
    filteredMemos = filteredMemos.filter(m => {
      // safe access for Timestamp
      const createdAt = m.createdAt instanceof Timestamp ? m.createdAt.toDate() : null;
      if (!createdAt) return true; 

      const memoDateStr = format(createdAt, 'yyyy-MM-dd');
      
      if (startDate && memoDateStr < startDate) return false;
      if (endDate && memoDateStr > endDate) return false;
      return true;
    });
  }
  
  // 爆速化: メモリ内でピン留めと作成日時順に一気にソート
  filteredMemos = [...filteredMemos].sort((a, b) => {
    // 1. ピン留め優先
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    
    // 2. 作成日時順 (新しい順)
    const timeA = (a.createdAt instanceof Timestamp) ? a.createdAt.seconds : 0;
    const timeB = (b.createdAt instanceof Timestamp) ? b.createdAt.seconds : 0;
    return timeB - timeA;
  });

  const getTag = (tagId: string) => tags.find(t => t.id === tagId);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500 min-h-screen">
      <header className="flex flex-col gap-4 mt-4">
        <div className="flex items-center justify-between ">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">{dict.memos.title}</h1>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsTagModalOpen(true)}
              className="w-10 h-10 bg-white shadow-sm border border-border rounded-full flex items-center justify-center text-muted-foreground hover:text-primary transition-all hover:scale-105 active:scale-95" 
              title={dict.common.manageTags}
            >
              <Settings2 size={20} />
            </button>
            <button 
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={`w-10 h-10 shadow-sm border rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${isSearchOpen ? 'bg-primary text-white border-primary' : 'bg-white border-border text-muted-foreground'}`}
            >
              <Search size={20} />
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        {isSearchOpen && (
          <div className="bg-white border border-border rounded-2xl p-5 shadow-lg space-y-4 animate-in slide-in-from-top-4 duration-500 overflow-hidden">
            {/* Word Search */}
            <div className="relative">
              <input 
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="キーワードで検索..."
                className="w-full bg-muted/30 border-2 border-transparent focus:border-primary/20 rounded-xl px-10 py-2.5 text-sm outline-none transition-all font-medium"
                autoFocus
              />
              <Search className="absolute left-3.5 top-3 text-primary/50" size={16} />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2.5 p-0.5 hover:bg-muted rounded-full text-muted-foreground"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Date Filters */}
            <div className="space-y-3 pt-2 border-t border-border/50">
               <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-1">
                    <CalendarDays size={14} className="text-primary"/> 期間で絞り込み
                  </span>
                  {(startDate || endDate) && (
                    <button onClick={clearDateFilter} className="text-[10px] bg-muted hover:bg-muted/80 px-2 py-0.5 rounded font-bold transition-colors">
                      クリア
                    </button>
                  )}
               </div>
               
               {/* Quick Buttons */}
               <div className="flex gap-2">
                 {[
                   { id: 'today', label: '今日' },
                   { id: 'week', label: '過去7日' },
                   { id: 'month', label: '過去30日' }
                 ].map(f => (
                   <button 
                    key={f.id}
                    onClick={() => handleQuickDateFilter(f.id)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                      quickDateFilter === f.id 
                      ? 'bg-primary text-white border-primary shadow-md' 
                      : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted'
                    }`}
                   >
                     {f.label}
                   </button>
                 ))}
               </div>

               {/* Custom Date Pickers */}
               <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input 
                      type="date"
                      value={startDate}
                      onChange={e => { setStartDate(e.target.value); setQuickDateFilter(null); }}
                      className="w-full bg-muted/30 border-none rounded-xl px-3 py-2 text-xs font-bold outline-none ring-primary/20 focus:ring-2"
                    />
                    <div className="absolute top-1/2 -translate-y-1/2 right-3 pointer-events-none opacity-40">
                      <ChevronRight size={10}/>
                    </div>
                  </div>
                  <span className="text-muted-foreground font-bold">~</span>
                  <div className="flex-1 relative">
                    <input 
                      type="date"
                      value={endDate}
                      onChange={e => { setEndDate(e.target.value); setQuickDateFilter(null); }}
                      className="w-full bg-muted/30 border-none rounded-xl px-3 py-2 text-xs font-bold outline-none ring-primary/20 focus:ring-2"
                    />
                     <div className="absolute top-1/2 -translate-y-1/2 right-3 pointer-events-none opacity-40">
                      <ChevronRight size={10}/>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        )}
      </header>

      {/* Tags Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide items-center">
        <button 
          onClick={() => { setActiveTagId(null); setShowFavoritesOnly(false); }}
          className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
            activeTagId === null && !showFavoritesOnly
            ? "bg-foreground text-background border-foreground shadow-md" 
            : "bg-white text-muted-foreground border-border hover:border-primary/50"
          }`}
        >
          All
        </button>
        <button 
          onClick={() => { setActiveTagId(null); setShowFavoritesOnly(true); }}
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 border ${
            showFavoritesOnly
            ? "bg-yellow-400 text-yellow-900 border-yellow-500 shadow-md" 
            : "bg-white text-yellow-500 border-border hover:border-yellow-400"
          }`}
        >
          <Star size={14} fill={showFavoritesOnly ? "currentColor" : "none"} /> Favorites
        </button>
        {tags.map(tag => (
          <button 
            key={tag.id}
            onClick={() => { setActiveTagId(tag.id); setShowFavoritesOnly(false); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 border ${
              activeTagId === tag.id 
              ? "ring-2 ring-offset-1 ring-primary/50 shadow-sm" 
              : "bg-white border-border hover:border-primary/30"
            }`}
            style={{ 
              backgroundColor: activeTagId === tag.id ? tag.color : "white",
              color: activeTagId === tag.id ? "white" : tag.color,
              borderColor: activeTagId === tag.id ? tag.color : undefined
            }}
          >
            <Tag size={12}/> {tag.name}
          </button>
        ))}
      </div>

      {/* Quick Input */}
      <section className="relative group bg-white rounded-2xl shadow-sm border border-border focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/5 transition-all">
        <textarea 
          value={inputMemoText}
          onChange={e => setInputMemoText(e.target.value)}
          placeholder={dict.memos.placeholder}
          className="w-full h-40 bg-transparent rounded-2xl p-5 pb-20 resize-none outline-none text-base leading-relaxed"
        ></textarea>
        
        {/* Quick Tagging and Save */}
        <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-3">
          {inputMemoTags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {inputMemoTags.map(tid => {
                const tag = getTag(tid);
                if (!tag) return null;
                return (
                  <span 
                    key={tid} 
                    className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border text-white shadow-sm animate-in zoom-in duration-200"
                    style={{ backgroundColor: tag.color, borderColor: tag.color }}
                  >
                    <Tag size={10} />
                    {tag.name}
                    <button 
                      onClick={() => setInputMemoTags(prev => prev.filter(id => id !== tid))}
                      className="ml-1 hover:bg-black/10 rounded-full transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
          
          <div className="flex justify-between items-center">
             <div className="flex items-center gap-2">
                {tags.length === 0 ? (
                  <button 
                    onClick={() => setIsTagModalOpen(true)}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-primary bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20 transition-all"
                  >
                    <Plus size={14} /> タグを作成
                  </button>
                ) : (
                  <>
                    <div className="flex -space-x-1 decoration-clone">
                      {tags.slice(0, 5).map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => {
                            if (inputMemoTags.includes(tag.id)) {
                              setInputMemoTags(prev => prev.filter(id => id !== tag.id));
                            } else {
                              setInputMemoTags(prev => [...prev, tag.id]);
                            }
                          }}
                          className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center relative ${inputMemoTags.includes(tag.id) ? 'z-10 scale-110 shadow-md border-white ring-2 ring-primary/20' : 'border-white hover:z-10 hover:scale-110'}`}
                          style={{ backgroundColor: tag.color }}
                          title={tag.name}
                        >
                          {inputMemoTags.includes(tag.id) && <X size={12} className="text-white" />}
                        </button>
                      ))}
                    </div>
                    {tags.length > 5 && (
                      <button 
                        onClick={() => setIsTagModalOpen(true)}
                        className="text-[10px] text-muted-foreground font-bold hover:text-primary transition-colors flex items-center gap-0.5 ml-1"
                      >
                        <Plus size={12} /> {tags.length - 5}
                      </button>
                    )}
                  </>
                )}
             </div>

            <div className="flex gap-2">
              {editingMemoId && (
                <button 
                  onClick={() => {
                    setEditingMemoId(null);
                    setInputMemoText("");
                    setInputMemoTags([]);
                  }}
                  className="px-4 py-2 rounded-xl font-medium text-sm text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              )}
              <button 
                onClick={handleSaveMemo}
                disabled={!inputMemoText.trim() || isSaving}
                className="bg-primary text-white px-6 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {editingMemoId ? "Update" : dict.memos.save}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* List / Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 text-muted-foreground gap-3">
          <Loader2 className="animate-spin text-primary" size={40} />
          <p className="text-sm font-medium">読み込み中...</p>
        </div>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-20">
          {filteredMemos.length === 0 ? (
            <div className="col-span-full text-center py-20 bg-muted/20 border-2 border-dashed border-border rounded-3xl">
               <p className="text-muted-foreground font-medium">メモが見つかりませんでした</p>
            </div>
          ) : (
            filteredMemos.map((memo) => (
              <div key={memo.id} className={`bg-white p-5 rounded-2xl border shadow-sm hover:shadow-md transition-all group relative flex flex-col ${memo.isPinned ? 'border-primary/40' : 'border-border'}`}>
                {memo.isPinned && (
                  <div className="absolute -top-2 -right-1 bg-primary text-white p-1.5 rounded-lg shadow-lg rotate-12 z-20">
                    <Pin size={12} fill="currentColor" />
                  </div>
                )}
                
                <div className="absolute top-3 right-3 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10">
                   <button 
                    onClick={() => handleToggleFavorite(memo)}
                    className={`p-1.5 rounded-lg transition-all ${memo.isFavorite ? 'text-yellow-500 bg-yellow-50' : 'text-muted-foreground hover:text-yellow-500 bg-muted'}`}
                   >
                     <Star size={14} fill={memo.isFavorite ? "currentColor" : "none"} />
                   </button>
                   <button 
                    onClick={() => handleTogglePin(memo)}
                    className={`p-1.5 rounded-lg transition-all ${memo.isPinned ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary bg-muted'}`}
                   >
                     <Pin size={14} fill={memo.isPinned ? "currentColor" : "none"} />
                   </button>
                   <button 
                    onClick={() => handleEditMemo(memo)}
                    className="p-1.5 text-muted-foreground hover:text-blue-500 bg-muted rounded-lg transition-all"
                   >
                     <Edit2 size={14} />
                   </button>
                   <button 
                    onClick={() => handleDeleteMemo(memo.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-500 bg-muted rounded-lg transition-all"
                   >
                    <Trash2 size={14} />
                   </button>
                </div>
                
                <p className="text-sm text-foreground leading-relaxed flex-1 mt-1 font-medium whitespace-pre-wrap">{memo.text}</p>
                
                <div className="mt-5 flex flex-col gap-2 pt-3 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                      {memo.date}
                    </span>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {memo.tags.map(tid => {
                        const tag = getTag(tid);
                        if (!tag) return null;
                        return (
                          <span 
                            key={tid} 
                            className="text-[9px] px-1.5 py-0.5 rounded border font-black uppercase tracking-tighter"
                            style={{ color: tag.color, borderColor: tag.color, backgroundColor: tag.color + '10' }}
                          >
                            {tag.name}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* Tag Management Modal */}
      {isTagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-foreground flex items-center gap-2">
                <Settings2 className="text-primary" size={24}/> タグの管理
              </h2>
              <button 
                onClick={() => { setIsTagModalOpen(false); setEditingTag(null); setNewTagName(""); }}
                className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Add / Edit Form */}
              <div className="p-4 bg-muted/30 rounded-2xl border border-border space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase">{editingTag ? "タグを編集" : "新しいタグを追加"}</label>
                  <input 
                    type="text"
                    value={newTagName}
                    onChange={e => setNewTagName(e.target.value)}
                    placeholder="タグ名を入力..."
                    className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all font-bold"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase">タグの色</label>
                  <div className="flex flex-wrap gap-2">
                    {PALETTE_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setNewTagColor(color)}
                          className={`w-6 h-6 rounded-full transition-all border-2 ${newTagColor === color ? "border-white ring-2 ring-primary scale-110 shadow-md" : "border-transparent opacity-80 hover:opacity-100"}`}
                          style={{ backgroundColor: color }}
                        />
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                   {editingTag && (
                     <button 
                      onClick={() => { setEditingTag(null); setNewTagName(""); }}
                      className="flex-1 bg-white border border-border text-muted-foreground py-2.5 rounded-xl font-bold text-sm"
                     >
                       キャンセル
                     </button>
                   )}
                   <button 
                    onClick={handleSaveTag}
                    disabled={!newTagName.trim()}
                    className="flex-3 bg-primary text-white py-2.5 rounded-xl font-black text-sm shadow-md hover:bg-primary/90 transition-all flex items-center justify-center gap-2 flex-1"
                   >
                     {editingTag ? <Save size={16}/> : <Plus size={16}/>}
                     {editingTag ? "更新する" : "タグを追加"}
                   </button>
                </div>
              </div>

              {/* Tag List */}
              <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide">
                <label className="text-xs font-bold text-muted-foreground uppercase">登録済みのタグ</label>
                {tags.length === 0 ? (
                   <p className="text-xs text-muted-foreground py-4 text-center">まだタグがありません</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {tags.map(tag => (
                      <div key={tag.id} className="flex items-center justify-between p-3 bg-white border border-border rounded-xl">
                        <div className="flex items-center gap-2">
                           <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }}></div>
                           <span className="text-sm font-bold text-foreground">{tag.name}</span>
                        </div>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => {
                              setEditingTag(tag);
                              setNewTagName(tag.name);
                              setNewTagColor(tag.color);
                            }}
                            className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteTag(tag.id)}
                            className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
