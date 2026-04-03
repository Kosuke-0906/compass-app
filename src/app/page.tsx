"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { 
  CheckCircle2, 
  Circle, 
  Plus, 
  Trash2, 
  CalendarDays, 
  CalendarClock, 
  RotateCw, 
  Edit3, 
  Smartphone, 
  Utensils, 
  BookOpen, 
  BarChart2, 
  Clock,
  ChevronRight
} from "lucide-react";
import { format, parseISO, startOfDay, isToday } from "date-fns";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  collection, 
  query, 
  where, 
  serverTimestamp, 
  deleteDoc,
  updateDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { 
  RoutineItem, 
  TodoItem, 
  saveRoutine, 
  deleteRoutine, 
  saveTodo, 
  deleteTodo,
  getMasterRoutines
} from "@/lib/firebase/db";

// メインコンポーネントをSuspenseで包むためのラッパー
export default function HomePage() {
  return (
    <Suspense fallback={<div className="p-10 text-center animate-pulse text-muted-foreground">Loading...</div>}>
      <DailyContent />
    </Suspense>
  );
}

function DailyContent() {
  const { dict } = useLanguage();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  
  // 表示する日付（URLパラメータがあればそれを、なければ今日）
  const displayDate = useMemo(() => {
    return dateParam ? parseISO(dateParam) : new Date();
  }, [dateParam]);

  const [progressPercent, setProgressPercent] = useState(50);
  const [wakeTime, setWakeTime] = useState("07:00");
  const [bedTime, setBedTime] = useState("23:30");
  const [isSleepExpanded, setIsSleepExpanded] = useState(false);
  const [schedule, setSchedule] = useState("");
  const [dinner, setDinner] = useState("");
  const [diary, setDiary] = useState("");
  const [phoneTimeMins, setPhoneTimeMins] = useState(0);
  
  const [expandedRoutineId, setExpandedRoutineId] = useState<string | null>(null);
  const [expandedTodoId, setExpandedTodoId] = useState<string | null>(null);
  
  const [targetStudyMins, setTargetStudyMins] = useState(120);
  const [todayStudyMins, setTodayStudyMins] = useState<number | null>(null);
  const [todayReadingMins, setTodayReadingMins] = useState<number | null>(null);
  const [dailyLogLoaded, setDailyLogLoaded] = useState(false);
  const [isSavingField, setIsSavingField] = useState<Record<string, boolean>>({});
  const [isDirty, setIsDirty] = useState<Record<string, boolean>>({});

  const { user } = useAuth();
  const todayStr = format(displayDate, "yyyy-MM-dd");
  
  // LocalStorage用のキー（ユーザーIDと日付を含む）
  const getDraftKey = () => `compass_draft_${user?.uid}_${todayStr}`;

  // 1. 初期ロード & LocalStorageからの復旧
  useEffect(() => {
    if (!user) return;
    
    // まずLocalStorageから復旧（最速）
    const savedDraft = localStorage.getItem(getDraftKey());
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.schedule !== undefined) setSchedule(draft.schedule);
        if (draft.diary !== undefined) setDiary(draft.diary);
        if (draft.dinner !== undefined) setDinner(draft.dinner);
        if (draft.wakeTime !== undefined) setWakeTime(draft.wakeTime);
        if (draft.bedTime !== undefined) setBedTime(draft.bedTime);
        if (draft.fulfillment !== undefined) setProgressPercent(draft.fulfillment);
        if (draft.phoneTimeMins !== undefined) setPhoneTimeMins(draft.phoneTimeMins);
        
        // バックアップから復元した項目をDirty（保存が必要）とする
        const dirtyFields: Record<string, boolean> = {};
        Object.keys(draft).forEach(k => dirtyFields[k] = true);
        setIsDirty(prev => ({ ...prev, ...dirtyFields }));
      } catch (e) {
        console.error("Draft restore failed", e);
      }
    }

    // 2. Firestoreからのリアルタイム同期（メモ帳方式）
    const docRef = doc(db, `users/${user.uid}/dailyLogs`, todayStr);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const log = snap.data();
        
        const savedDraftStr = localStorage.getItem(getDraftKey());
        const draft = savedDraftStr ? JSON.parse(savedDraftStr) : {};

        if (draft.schedule === undefined) setSchedule(log.schedule || "");
        if (draft.diary === undefined) setDiary(log.diary || "");
        if (draft.dinner === undefined) setDinner(log.dinner || "");
        if (draft.wakeTime === undefined) setWakeTime(log.wakeTime || "07:00");
        if (draft.bedTime === undefined) setBedTime(log.bedTime || "23:30");
        if (draft.fulfillment === undefined) setProgressPercent(log.fulfillment ?? 50);
        if (draft.phoneTimeMins === undefined) setPhoneTimeMins(log.phoneTimeMins || 0);
      }
      setDailyLogLoaded(true);
    }, (err) => {
      console.error("Firestore sync error:", err);
      setDailyLogLoaded(true);
    });

    return () => unsub();
  }, [user, todayStr]);

  // ルーティンとToDoの取得
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [routinesLoaded, setRoutinesLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    // ルーティンの同期
    const qRoutines = query(collection(db, `users/${user.uid}/routines`), where("date", "==", todayStr));
    const unsubRoutines = onSnapshot(qRoutines, async (snap) => {
      let fetchedRoutines = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RoutineItem));
      
      // ルーティンが空で、今日の日付の場合のみマスタールーティンからコピー
      if (fetchedRoutines.length === 0 && isToday(displayDate)) {
        const masterData = await getMasterRoutines(user.uid);
        if (masterData.length > 0) {
          for (const m of masterData) {
            await saveRoutine(user.uid, { text: m.text, date: todayStr, completed: false });
          }
          // saveRoutineを呼ぶとonSnapshotが再発火するので、ここではセットしなくてOK
        }
      }
      setRoutines(fetchedRoutines);
      setRoutinesLoaded(true);
    });

    // ToDoの同期
    const qTodos = query(collection(db, `users/${user.uid}/todos`), where("date", "==", todayStr));
    const unsubTodos = onSnapshot(qTodos, (snap) => {
      setTodos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TodoItem)));
    });

    return () => {
      unsubRoutines();
      unsubTodos();
    };
  }, [user, todayStr, displayDate]);

  // 今日の勉強時間を取得
  useEffect(() => {
    if (!user) return;
    const qStudy = query(collection(db, `users/${user.uid}/studyLogs`), where("date", "==", todayStr));
    const unsubStudy = onSnapshot(qStudy, (snap) => {
      const total = snap.docs.reduce((acc, doc) => acc + doc.data().durationMins, 0);
      setTodayStudyMins(total);
    });
    return () => unsubStudy();
  }, [user, todayStr]);

  // 今日の読書時間を取得
  useEffect(() => {
    if (!user) return;
    const qReading = query(collection(db, `users/${user.uid}/readingLogs`), where("date", "==", todayStr));
    const unsubReading = onSnapshot(qReading, (snap) => {
      const total = snap.docs.reduce((acc, doc) => acc + doc.data().durationMins, 0);
      setTodayReadingMins(total);
    });
    return () => unsubReading();
  }, [user, todayStr]);

  // 各フィールドのリアルタイム保存（LocalStorage + Debounced Remote）
  const handleFieldChange = (field: string, value: any, setter: Function) => {
    setter(value);
    setIsDirty(prev => ({ ...prev, [field]: true }));
    
    // LocalStorageに下書き保存
    const savedDraft = localStorage.getItem(getDraftKey());
    const draft = savedDraft ? JSON.parse(savedDraft) : {};
    draft[field] = value;
    localStorage.setItem(getDraftKey(), JSON.stringify(draft));
  };

  const saveField = async (field: string, value: any) => {
    if (!user) return;
    setIsSavingField(prev => ({ ...prev, [field]: true }));
    try {
      const docRef = doc(db, `users/${user.uid}/dailyLogs`, todayStr);
      const updateData: any = {};
      
      // フィールド名のマッピング（内部状態名 -> Firestore項目名）
      const fieldMap: Record<string, string> = {
        schedule: 'schedule',
        diary: 'diary',
        fulfillment: 'fulfillment',
        wakeTime: 'wakeTime',
        bedTime: 'bedTime',
        dinner: 'dinner',
        phoneTimeMins: 'phoneTimeMins'
      };
      
      updateData[fieldMap[field] || field] = value;
      updateData.updatedAt = serverTimestamp();
      
      await setDoc(docRef, updateData, { merge: true });
      
      // LocalStorageの下書きから削除
      const savedDraft = localStorage.getItem(getDraftKey());
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        delete draft[field];
        if (Object.keys(draft).length === 0) {
          localStorage.removeItem(getDraftKey());
        } else {
          localStorage.setItem(getDraftKey(), JSON.stringify(draft));
        }
      }
      
      setIsDirty(prev => ({ ...prev, [field]: false }));
    } catch (e) {
      console.error("Save failed", e);
    } finally {
      setIsSavingField(prev => ({ ...prev, [field]: false }));
    }
  };

  const [showRoutineInput, setShowRoutineInput] = useState(false);
  const [newRoutineText, setNewRoutineText] = useState("");
  const [showTodoInput, setShowTodoInput] = useState(false);
  const [newTodoText, setNewTodoText] = useState("");

  const handleAddRoutine = async () => {
    if (!user || !newRoutineText.trim()) return;
    await saveRoutine(user.uid, { text: newRoutineText.trim(), date: todayStr, completed: false, achievement: 1 });
    setNewRoutineText("");
    setShowRoutineInput(false);
  };

  const handleAddTodo = async () => {
    if (!user || !newTodoText.trim()) return;
    await saveTodo(user.uid, { text: newTodoText.trim(), date: todayStr, completed: false, achievement: 1 });
    setNewTodoText("");
    setShowTodoInput(false);
  };

  const handleUpdateRoutine = async (routine: RoutineItem, updates: Partial<RoutineItem>) => {
    if (!user) return;
    
    // Optimistic Update
    const updated = { ...routine, ...updates };
    setRoutines(prev => prev.map(r => r.id === routine.id ? updated : r));

    const { saveRoutine } = await import("@/lib/firebase/db");
    await saveRoutine(user.uid, { 
      text: updated.text, 
      date: updated.date, 
      completed: (updated.achievement || 0) >= 5, 
      achievement: updated.achievement,
      comment: updated.comment 
    }, routine.id);
  };

  const handleUpdateTodo = async (todo: TodoItem, updates: Partial<TodoItem>) => {
    if (!user) return;
    
    // Optimistic Update
    const updated = { ...todo, ...updates };
    setTodos(prev => prev.map(t => t.id === todo.id ? updated : t));

    const { saveTodo } = await import("@/lib/firebase/db");
    await saveTodo(user.uid, { 
      text: updated.text, 
      date: updated.date, 
      completed: (updated.achievement || 0) >= 5,
      achievement: updated.achievement,
      comment: updated.comment 
    }, todo.id);
  };

  const handleDeleteRoutine = async (id: string) => {
    if (!user) return;
    await deleteRoutine(user.uid, id);
  };

  const handleDeleteTodo = async (id: string) => {
    if (!user) return;
    await deleteTodo(user.uid, id);
  };

  // 1日の充実度グラデーション
  const hue = 220 - (progressPercent * 2.2); 
  const progressColor = `hsl(${hue}, 80%, 65%)`;

  const calculateSleepDuration = (start: string, end: string) => {
    if (!start || !end) return { text: "", color: "var(--foreground)" };
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);
    let durationMins = (endH * 60 + endM) - (startH * 60 + startM);
    if (durationMins < 0) durationMins += 24 * 60;
    const h = Math.floor(durationMins / 60);
    const m = durationMins % 60;

    let sleepHue = 120;
    if (durationMins < 450) {
      sleepHue = Math.max(0, 120 - ((450 - durationMins) * 1.5));
    }
    return { 
      text: `${h}h ${m}m`, 
      color: `hsl(${sleepHue}, 70%, 45%)` 
    };
  };

  const sleepInfo = calculateSleepDuration(bedTime, wakeTime);

  // Time Selectors for Phone Time/Any Time
  const renderTimeSelectors = (mins: number, onChange: (newMins: number) => void) => (
    <div className="flex gap-2">
      <div className="flex bg-background border border-border rounded-lg overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
        <select 
          value={Math.floor(mins / 60)}
          onChange={(e) => onChange(Number(e.target.value) * 60 + (mins % 60))}
          className="bg-transparent px-2 py-2.5 text-sm font-medium text-foreground outline-none appearance-none cursor-pointer"
        >
          {[...Array(25)].map((_, i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <span className="flex items-center text-xs text-muted-foreground pr-2 font-medium pointer-events-none select-none">{dict.daily.hours}</span>
      </div>
      <div className="flex bg-background border border-border rounded-lg overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
        <select 
          value={mins % 60}
          onChange={(e) => onChange(Math.floor(mins / 60) * 60 + Number(e.target.value))}
          className="bg-transparent px-2 py-2.5 text-sm font-medium text-foreground outline-none appearance-none cursor-pointer"
        >
          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>)}
        </select>
        <span className="flex items-center text-xs text-muted-foreground pr-2 font-medium pointer-events-none select-none">{dict.daily.minutes}</span>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-8 animate-in fade-in duration-700 pb-24">
      <header>
        <div className="flex items-end gap-3 mt-1 mb-4 flex-wrap">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
            {dict.daily.title}
          </h1>
          <span className="text-lg text-muted-foreground font-semibold pb-0.5">
            {format(displayDate, "MM/dd (E)")}
          </span>
        </div>
        <Link href="/calendar" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-border rounded-full text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/50 shadow-sm transition-all group">
          <CalendarDays size={14} className="text-primary/70 group-hover:text-primary transition-colors" /> {dict.daily.selectAnotherDay}
        </Link>
      </header>

      {/* Today's Schedule */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-xl flex items-center gap-2">
            <CalendarClock className="text-primary" size={22}/> 
            {dict.daily.todaySchedule}
          </h2>
          {isDirty.schedule && (
            <button 
              onClick={() => saveField('schedule', schedule)}
              disabled={isSavingField.schedule}
              className="flex items-center gap-1.5 px-3 py-1 bg-primary text-white rounded-full text-xs font-bold shadow-sm animate-in fade-in zoom-in"
            >
              {isSavingField.schedule ? <RotateCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              {dict.memos.save}
            </button>
          )}
        </div>
        <textarea 
          value={schedule}
          onChange={e => handleFieldChange('schedule', e.target.value, setSchedule)}
          placeholder={dict.daily.todaySchedulePlaceholder}
          className="w-full h-24 bg-white border border-border rounded-xl p-4 resize-none shadow-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm leading-relaxed"
        ></textarea>
      </section>

      {/* Routines */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-xl flex items-center gap-2">
            <RotateCw className="text-primary" size={22}/> 
            {dict.daily.routine}
          </h2>
          <Link href="/settings/routines" className="text-xs font-bold text-primary hover:bg-primary/5 px-3 py-1.5 rounded-full border border-primary/20 transition-all">
             {dict.daily.manageRoutines}
          </Link>
        </div>
        <div className="space-y-3">
          {routines.map((routine) => {
             const currentAchievement = routine.achievement || (routine.completed ? 5 : 1);
             const isExpanded = expandedRoutineId === routine.id;
             
             const getAchievementColor = (level: number) => {
               if (level === 5) return "bg-red-500";
               if (level === 4) return "bg-orange-500";
               if (level === 3) return "bg-yellow-500";
               if (level === 2) return "bg-teal-400";
               if (level === 1) return "bg-blue-500";
               return "bg-muted";
             };

             const getAchievementBorder = (level: number) => {
               if (level === 5) return "border-red-500/20";
               if (level === 4) return "border-orange-500/20";
               if (level === 3) return "border-yellow-500/20";
               if (level === 2) return "border-teal-400/20";
               if (level === 1) return "border-blue-500/20";
               return "border-border";
             };

             return (
               <div 
                 key={routine.id} 
                 className={`flex flex-col gap-3 p-4 rounded-2xl transition-all border shadow-sm ${
                   isExpanded ? "bg-primary/[0.03] " + getAchievementBorder(currentAchievement) : "bg-white border-border"
                 }`}
               >
                 {/* Compact Header */}
                 <div 
                   className="flex items-center gap-3 cursor-pointer"
                   onClick={() => setExpandedRoutineId(isExpanded ? null : routine.id)}
                 >
                   <span className={`flex-1 text-base font-bold text-foreground leading-tight ${!isExpanded ? "truncate" : ""}`}>
                     {routine.text}
                   </span>
                   
                   {!isExpanded && (
                     <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-sm ${getAchievementColor(currentAchievement)}`}>
                        {currentAchievement}
                     </div>
                   )}

                   <button onClick={(e) => { e.stopPropagation(); handleDeleteRoutine(routine.id); }} className="text-muted-foreground hover:text-red-500 p-1 transition-colors">
                     <Trash2 size={16} />
                   </button>
                 </div>
                 
                 {/* Expanded Content */}
                 {isExpanded && (
                   <div className="space-y-4 pt-2 animate-in slide-in-from-top-2 duration-200">
                     <div className="flex flex-wrap items-center gap-2">
                       {[1, 2, 3, 4, 5].map((level) => (
                         <button
                           key={level}
                           onClick={() => {
                             handleUpdateRoutine(routine, { achievement: level });
                             setExpandedRoutineId(null); // Auto-collapse
                           }}
                           className={`w-9 h-9 rounded-full text-xs font-black transition-all border-2 ${
                             currentAchievement === level
                               ? "text-white scale-110 shadow-md " + getAchievementColor(level) + " " + getAchievementBorder(level)
                               : "bg-background border-border text-muted-foreground hover:border-primary/50"
                           }`}
                         >
                           {level}
                         </button>
                       ))}
                       <div className="ml-auto text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/30 px-2 py-1 rounded italic">Level</div>
                     </div>

                     <div className="relative">
                       <input 
                         type="text" 
                         value={routine.comment || ""}
                         onChange={(e) => handleUpdateRoutine(routine, { comment: e.target.value })}
                         placeholder="コメント・振り返り..."
                         className="w-full bg-transparent border-b border-border/50 focus:border-primary py-1 text-xs outline-none transition-colors font-medium text-foreground/80"
                       />
                     </div>
                   </div>
                 )}
               </div>
             );
           })}
          {showRoutineInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newRoutineText}
                onChange={e => setNewRoutineText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddRoutine()}
                placeholder="ルーティン名..."
                className="flex-1 border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
                autoFocus
              />
              <button onClick={handleAddRoutine} className="bg-primary text-white px-4 rounded-xl font-bold text-sm">追加</button>
              <button onClick={() => { setShowRoutineInput(false); setNewRoutineText(""); }} className="text-muted-foreground px-2">✕</button>
            </div>
          ) : (
            <button onClick={() => setShowRoutineInput(true)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors py-2 px-1">
              <Plus size={16} /> {dict.daily.addRoutine}
            </button>
          )}
        </div>
      </section>

      {/* Todo List */}
      <section>
        <div className="mb-3">
          <h2 className="font-semibold text-xl flex items-center gap-2">
            <CheckCircle2 className="text-primary" size={22}/> 
            {dict.daily.todo}
          </h2>
        </div>
        <div className="space-y-3">
          {todos.map((todo) => {
             const currentAchievement = todo.achievement || (todo.completed ? 5 : 1);
             const isExpanded = expandedTodoId === todo.id;

             const getLevelColor = (level: number) => {
               if (level === 5) return "bg-red-500";
               if (level === 4) return "bg-orange-500";
               if (level === 3) return "bg-yellow-500";
               if (level === 2) return "bg-teal-400";
               if (level === 1) return "bg-blue-500";
               return "bg-muted";
             };

             return (
               <div 
                 key={todo.id} 
                 className={`flex flex-col gap-3 p-4 rounded-2xl transition-all border shadow-sm ${
                   isExpanded ? "bg-slate-50 border-border" : "bg-white border-border"
                 }`}
               >
                 <div 
                   className="flex items-center gap-3 cursor-pointer"
                   onClick={() => setExpandedTodoId(isExpanded ? null : todo.id)}
                 >
                   <span className={`flex-1 text-base font-bold text-foreground leading-tight ${!isExpanded ? "truncate" : ""}`}>
                     {todo.text}
                   </span>

                   {!isExpanded && (
                     <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-sm ${getLevelColor(currentAchievement)}`}>
                        {currentAchievement}
                     </div>
                   )}

                   <button onClick={(e) => { e.stopPropagation(); handleDeleteTodo(todo.id); }} className="text-muted-foreground hover:text-red-500 p-1 transition-colors">
                     <Trash2 size={16} />
                   </button>
                 </div>

                 {isExpanded && (
                   <div className="space-y-4 pt-2 animate-in slide-in-from-top-2 duration-200">
                     <div className="flex flex-wrap items-center gap-2">
                       {[1, 2, 3, 4, 5].map((level) => (
                         <button
                           key={level}
                           onClick={() => {
                             handleUpdateTodo(todo, { achievement: level });
                             setExpandedTodoId(null);
                           }}
                           className={`w-9 h-9 rounded-full text-xs font-black transition-all border-2 ${
                             currentAchievement === level
                               ? "text-white scale-110 shadow-md " + getLevelColor(level)
                               : "bg-background border-border text-muted-foreground hover:border-primary/50"
                           }`}
                         >
                           {level}
                         </button>
                       ))}
                     </div>

                     <div className="relative">
                       <input 
                         type="text" 
                         value={todo.comment || ""}
                         onChange={(e) => handleUpdateTodo(todo, { comment: e.target.value })}
                         placeholder="メモ..."
                         className="w-full bg-transparent border-b border-border/50 focus:border-primary py-1 text-xs outline-none transition-colors font-medium text-foreground/70"
                       />
                     </div>
                   </div>
                 )}
               </div>
             );
           })}
          {showTodoInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newTodoText}
                onChange={e => setNewTodoText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddTodo()}
                placeholder="やること..."
                className="flex-1 border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
                autoFocus
              />
              <button onClick={handleAddTodo} className="bg-primary text-white px-4 rounded-xl font-bold text-sm">追加</button>
              <button onClick={() => { setShowTodoInput(false); setNewTodoText(""); }} className="text-muted-foreground px-2">✕</button>
            </div>
          ) : (
            <button onClick={() => setShowTodoInput(true)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors py-2 px-1">
              <Plus size={16} /> {dict.daily.addTodo}
            </button>
          )}
        </div>
      </section>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Link href="/study" className="bg-white p-4 rounded-2xl border border-border shadow-sm flex flex-col gap-2 group hover:border-primary/50 transition-all">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">{dict.daily.studyTime}</span>
            <BarChart2 size={16} />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-foreground">
              {todayStudyMins !== null ? Math.floor(todayStudyMins / 60) : "0"}
            </span>
            <span className="text-xs font-bold text-muted-foreground">h</span>
            <span className="text-2xl font-black text-foreground ml-1">
              {todayStudyMins !== null ? todayStudyMins % 60 : "0"}
            </span>
            <span className="text-xs font-bold text-muted-foreground">m</span>
          </div>
        </Link>

        <Link href="/reading" className="bg-white p-4 rounded-2xl border border-border shadow-sm flex flex-col gap-2 group hover:border-primary/50 transition-all">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">{dict.daily.readingTime}</span>
            <BookOpen size={16} />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-foreground">
              {todayReadingMins !== null ? Math.floor(todayReadingMins / 60) : "0"}
            </span>
            <span className="text-xs font-bold text-muted-foreground">h</span>
            <span className="text-2xl font-black text-foreground ml-1">
              {todayReadingMins !== null ? todayReadingMins % 60 : "0"}
            </span>
            <span className="text-xs font-bold text-muted-foreground">m</span>
          </div>
        </Link>
      </div>

      {/* Fulfillment slider */}
      <section className="bg-white p-6 rounded-3xl border border-border shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="font-bold text-lg text-foreground">{dict.daily.fulfillment}</h2>
            <p className="text-xs text-muted-foreground font-medium">1日の満足度を直感的に記録しましょう</p>
          </div>
          <div 
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg transition-all"
            style={{ backgroundColor: progressColor }}
          >
            {progressPercent}%
          </div>
        </div>
        
        <div className="space-y-4">
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={progressPercent} 
            onChange={e => handleFieldChange('fulfillment', Number(e.target.value), setProgressPercent)}
            onBlur={() => saveField('fulfillment', progressPercent)}
            className="w-full h-2 bg-muted rounded-full appearance-none outline-none cursor-pointer accent-primary"
            style={{ accentColor: progressColor }}
          />
          <div className="flex justify-between text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">
             <span>Low</span>
             <span>Ordinary</span>
             <span>Excellent</span>
          </div>
        </div>
      </section>

      {/* Sleep Tracker */}
      <section className="bg-white rounded-3xl border border-border shadow-sm overflow-hidden">
        <button 
          onClick={() => setIsSleepExpanded(!isSleepExpanded)}
          className="w-full p-5 flex items-center justify-between hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Clock size={22} />
            </div>
            <div className="text-left">
              <h2 className="font-bold text-foreground">{dict.daily.sleepAndWake}</h2>
              <p className="text-xs text-muted-foreground font-medium">目標：7時間30分以上</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="text-right">
                <p className="text-lg font-black text-foreground">{sleepInfo.text}</p>
                <p className="text-[10px] font-bold uppercase tracking-tighter" style={{ color: sleepInfo.color }}>Healthy range</p>
             </div>
             <ChevronRight className={`text-muted-foreground transition-transform ${isSleepExpanded ? "rotate-90" : ""}`} size={20} />
          </div>
        </button>
        
        {isSleepExpanded && (
          <div className="p-5 pt-0 border-t border-border/50 grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5"><Clock size={12}/> {dict.daily.wakeTime}</label>
              <input 
                type="time" 
                value={wakeTime}
                onChange={e => handleFieldChange("wakeTime", e.target.value, setWakeTime)}
                onBlur={() => saveField("wakeTime", wakeTime)}
                className="w-full bg-background border border-border rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5"><Clock size={12}/> {dict.daily.bedTime}</label>
              <input 
                type="time" 
                value={bedTime}
                onChange={e => handleFieldChange("bedTime", e.target.value, setBedTime)}
                onBlur={() => saveField("bedTime", bedTime)}
                className="w-full bg-background border border-border rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>
        )}
      </section>

      {/* Evening Reflection & Extras */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-xl flex items-center gap-2">
            <Edit3 className="text-primary" size={22}/> 
            {dict.daily.reflection}
          </h2>
          {(isDirty.diary || isDirty.dinner || isDirty.phoneTimeMins) && (
            <button 
              onClick={async () => {
                if (isDirty.diary) await saveField('diary', diary);
                if (isDirty.dinner) await saveField('dinner', dinner);
                if (isDirty.phoneTimeMins) await saveField('phoneTimeMins', phoneTimeMins);
              }}
              disabled={isSavingField.diary || isSavingField.dinner || isSavingField.phoneTimeMins}
              className="flex items-center gap-1.5 px-3 py-1 bg-primary text-white rounded-full text-xs font-bold shadow-sm animate-in fade-in zoom-in"
            >
              {(isSavingField.diary || isSavingField.dinner || isSavingField.phoneTimeMins) ? <RotateCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              一括保存
            </button>
          )}
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-border space-y-5">
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="space-y-2 flex-1">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Smartphone size={14}/> {dict.daily.phoneTime}</label>
                {renderTimeSelectors(phoneTimeMins, (val) => handleFieldChange("phoneTimeMins", val, setPhoneTimeMins))}
            </div>
            
            <div className="space-y-2 flex-1 pb-0">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Utensils size={14}/> {dict.daily.dinner}
              </label>
              <input 
                type="text" 
                value={dinner}
                onChange={e => handleFieldChange('dinner', e.target.value, setDinner)}
                placeholder={dict.daily.dinnerPlaceholder}
                className="w-full bg-background border border-border rounded-lg p-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2"><Edit3 size={14}/> {dict.daily.diary}</label>
            <textarea 
              value={diary}
              onChange={e => handleFieldChange('diary', e.target.value, setDiary)}
              placeholder={dict.daily.diaryPlaceholder}
              className="w-full h-32 bg-background border border-border rounded-xl p-4 resize-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm leading-relaxed"
            ></textarea>
          </div>
        </div>
      </div>
    </div>
  );
}
