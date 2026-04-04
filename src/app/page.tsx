"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
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
  ChevronRight,
  Target
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

  const [progressPercent, setProgressPercent] = useState(0);
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
  const provisioningRef = React.useRef<Record<string, boolean>>({});

  const { user } = useAuth();
  const todayStr = format(displayDate, "yyyy-MM-dd");
  
  // LocalStorage用のキー（ユーザーIDと日付を含む）
  const getDraftKey = React.useCallback(() => `compass_draft_${user?.uid}_${todayStr}`, [user?.uid, todayStr]);

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
        if (draft.phoneTimeMins === undefined) setPhoneTimeMins(log.phoneTimeMins || 0);

        // 充実度は計算ベースだが、初期表示だけFirestoreから取る（Todosが読み込まれるまでの間）
        if (!routines.length && !todos.length) {
          setProgressPercent(log.fulfillment ?? 0);
        }
      }
      setDailyLogLoaded(true);
    }, (err) => {
      console.error("Firestore sync error:", err);
      setDailyLogLoaded(true);
    });

    return () => unsub();
  }, [user, todayStr, getDraftKey]);

  // ルーティンとToDoの取得
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [routinesLoaded, setRoutinesLoaded] = useState(false);
  const [todosLoaded, setTodosLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    // ルーティンの同期
    const qRoutines = query(collection(db, `users/${user.uid}/routines`), where("date", "==", todayStr));
    const unsubRoutines = onSnapshot(qRoutines, (snap) => {
      const fetchedRoutines = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RoutineItem));
      setRoutines(fetchedRoutines);
      setRoutinesLoaded(true);
    }, (err) => {
      console.error(err);
      setRoutinesLoaded(true);
    });

    // ToDoの同期
    const qTodos = query(collection(db, `users/${user.uid}/todos`), where("date", "==", todayStr));
    const unsubTodos = onSnapshot(qTodos, (snap) => {
      setTodos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TodoItem)));
      setTodosLoaded(true);
    }, (err) => {
      console.error(err);
      setTodosLoaded(true);
    });

    return () => {
      unsubRoutines();
      unsubTodos();
    };
  }, [user, todayStr]);

  // ルーティンの初回プロビジョニング（マスタールーティンからのコピー）
  useEffect(() => {
    // ユーザー、基本ログ、ルーティン一覧が「完全にロード完了」した後に判定
    if (!user || !dailyLogLoaded || !routinesLoaded || provisioningRef.current[todayStr]) return;
    
    // 既にルーティンが存在する場合はプロビジョニング不要
    if (routines.length > 0) return;

    const isFutureOrToday = displayDate >= startOfDay(new Date());
    if (!isFutureOrToday) return;

    const provision = async () => {
      provisioningRef.current[todayStr] = true;
      const masterData = await getMasterRoutines(user.uid);
      
      if (masterData.length > 0) {
        // 重複保存を避けるための追加チェック（念のため）
        // Promise.allで並列実行する前に、現在の最新状態を再度考慮する
        for (const m of masterData) {
          // 同じテキストのものが既にstateにないか（race condition対策）
          if (!routines.some(r => r.text === m.text)) {
            await saveRoutine(user.uid, { text: m.text, date: todayStr, completed: false, achievement: 1 });
          }
        }
      }
    };
    provision();
  }, [user, dailyLogLoaded, routinesLoaded, routines, todayStr, displayDate]);

  // オート充実度計算
  const calculatedFulfillment = useMemo(() => {
    const allItems = [...routines, ...todos];
    if (allItems.length === 0) return 0;
    const totalAchievement = allItems.reduce((acc, item) => acc + (item.achievement || (item.completed ? 5 : 1)), 0);
    const maxPossible = allItems.length * 5;
    return Math.round((totalAchievement / maxPossible) * 100);
  }, [routines, todos]);

  // 計算値が変更されたらFirestoreに同期
  useEffect(() => {
    if (!user || !dailyLogLoaded || (routines.length === 0 && todos.length === 0)) return;
    if (calculatedFulfillment !== progressPercent) {
      const saveFulfillment = async () => {
        const docRef = doc(db, `users/${user.uid}/dailyLogs`, todayStr);
        await setDoc(docRef, { fulfillment: calculatedFulfillment, updatedAt: serverTimestamp() }, { merge: true });
        setProgressPercent(calculatedFulfillment);
      };
      saveFulfillment();
    }
  }, [calculatedFulfillment, user, todayStr, dailyLogLoaded, progressPercent]);

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

  // 保存処理
  const saveField = async (field: string, value: unknown) => {
    if (!user) return;
    setIsSavingField(prev => ({ ...prev, [field]: true }));
    try {
      const docRef = doc(db, `users/${user.uid}/dailyLogs`, todayStr);
      const updateData: Record<string, unknown> = {};
      const fieldMap: Record<string, string> = {
        schedule: 'schedule', diary: 'diary', fulfillment: 'fulfillment',
        wakeTime: 'wakeTime', bedTime: 'bedTime', dinner: 'dinner', phoneTimeMins: 'phoneTimeMins'
      };
      updateData[fieldMap[field] || field] = value;
      updateData.updatedAt = serverTimestamp();
      await setDoc(docRef, updateData, { merge: true });
      
      const savedDraft = localStorage.getItem(getDraftKey());
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        delete draft[field];
        if (Object.keys(draft).length === 0) localStorage.removeItem(getDraftKey());
        else localStorage.setItem(getDraftKey(), JSON.stringify(draft));
      }
      setIsDirty(prev => ({ ...prev, [field]: false }));
    } catch (e) { console.error(e); } finally { setIsSavingField(prev => ({ ...prev, [field]: false })); }
  };

  const handleFieldChange = <T,>(field: string, value: T, setter: (val: T) => void) => {
    setter(value);
    setIsDirty(prev => ({ ...prev, [field]: true }));
    const savedDraft = localStorage.getItem(getDraftKey());
    const draft = savedDraft ? JSON.parse(savedDraft) : {};
    draft[field] = value;
    localStorage.setItem(getDraftKey(), JSON.stringify(draft));
  };

  const [showRoutineInput, setShowRoutineInput] = useState(false);
  const [newRoutineText, setNewRoutineText] = useState("");
  const [showTodoInput, setShowTodoInput] = useState(false);
  const [newTodoText, setNewTodoText] = useState("");

  const handleAddRoutine = async () => {
    if (!user || !newRoutineText.trim()) return;
    await saveRoutine(user.uid, { text: newRoutineText.trim(), date: todayStr, completed: false, achievement: 1 });
    setNewRoutineText(""); setShowRoutineInput(false);
  };

  const handleAddTodo = async () => {
    if (!user || !newTodoText.trim()) return;
    await saveTodo(user.uid, { text: newTodoText.trim(), date: todayStr, completed: false, achievement: 1 });
    setNewTodoText(""); setShowTodoInput(false);
  };

  const handleUpdateRoutine = async (routine: RoutineItem, updates: Partial<RoutineItem>) => {
    if (!user) return;
    const updated = { ...routine, ...updates };
    
    // 5なら完了とする（互換性のため）
    const isCompleted = (updated.achievement !== undefined) ? updated.achievement >= 5 : updated.completed;
    const finalUpdate = { ...updated, completed: isCompleted };

    setRoutines(prev => prev.map(r => r.id === routine.id ? finalUpdate : r));
    await saveRoutine(user.uid, { 
      text: finalUpdate.text, 
      date: finalUpdate.date, 
      completed: finalUpdate.completed, 
      achievement: finalUpdate.achievement, 
      comment: finalUpdate.comment 
    }, routine.id);
  };

  const handleUpdateTodo = async (todo: TodoItem, updates: Partial<TodoItem>) => {
    if (!user) return;
    const updated = { ...todo, ...updates };
    
    const isCompleted = (updated.achievement !== undefined) ? updated.achievement >= 5 : updated.completed;
    const finalUpdate = { ...updated, completed: isCompleted };

    setTodos(prev => prev.map(t => t.id === todo.id ? finalUpdate : t));
    await saveTodo(user.uid, { 
      text: finalUpdate.text, 
      date: finalUpdate.date, 
      completed: finalUpdate.completed, 
      achievement: finalUpdate.achievement, 
      comment: finalUpdate.comment 
    }, todo.id);
  };

  const handleDeleteRoutine = async (id: string) => { if (!user) return; await deleteRoutine(user.uid, id); };
  const handleDeleteTodo = async (id: string) => { if (!user) return; await deleteTodo(user.uid, id); };

  const getAchievementColor = (level: number) => {
    if (level === 5) return "bg-red-500";
    if (level === 4) return "bg-orange-500";
    if (level === 3) return "bg-yellow-500";
    if (level === 2) return "bg-teal-400";
    if (level === 1) return "bg-blue-500";
    return "bg-muted";
  };

  const sleepInfo = useMemo(() => {
    if (!wakeTime || !bedTime) return { text: "", color: "#000" };
    const [startH, startM] = bedTime.split(":").map(Number);
    const [endH, endM] = wakeTime.split(":").map(Number);
    let mins = (endH * 60 + endM) - (startH * 60 + startM);
    if (mins < 0) mins += 1440;
    const h = Math.floor(mins / 60); const m = mins % 60;
    let hue = 120; if (mins < 450) hue = Math.max(0, 120 - ((450 - mins) * 1.5));
    return { text: `${h}h ${m}m`, color: `hsl(${hue}, 70%, 45%)` };
  }, [wakeTime, bedTime]);

  const renderTimeSelectors = (mins: number, onChange: (newMins: number) => void) => (
    <div className="flex gap-2">
      <div className="flex bg-background border border-gray-100 rounded-lg overflow-hidden">
        <select value={Math.floor(mins / 60)} onChange={(e) => onChange(Number(e.target.value) * 60 + (mins % 60))} className="bg-transparent px-2 py-2 text-sm">
          {[...Array(25)].map((_, i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <span className="text-[10px] flex items-center pr-1 opacity-50">h</span>
      </div>
      <div className="flex bg-background border border-gray-100 rounded-lg overflow-hidden">
        <select value={mins % 60} onChange={(e) => onChange(Math.floor(mins / 60) * 60 + Number(e.target.value))} className="bg-transparent px-2 py-2 text-sm">
          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>)}
        </select>
        <span className="text-[10px] flex items-center pr-1 opacity-50">m</span>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-8 pb-32 animate-in fade-in duration-500">
      <header>
        <div className="flex items-end gap-3 mt-1 mb-4">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">{dict.daily.title}</h1>
          <span className="text-lg text-muted-foreground font-semibold pb-0.5">{format(displayDate, "MM/dd (E)")}</span>
        </div>
        <Link href="/calendar" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 rounded-full text-xs font-bold text-muted-foreground shadow-sm">
          <CalendarDays size={14} /> {dict.daily.selectAnotherDay}
        </Link>
      </header>

      {/* Schedule */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-xl flex items-center gap-2"><CalendarClock className="text-primary" size={22}/> {dict.daily.todaySchedule}</h2>
          {isDirty.schedule && <button onClick={() => saveField('schedule', schedule)} className="bg-primary text-white px-3 py-1 rounded-full text-xs font-bold shadow-md hover:brightness-110">保存</button>}
        </div>
        <textarea value={schedule} onChange={e => handleFieldChange('schedule', e.target.value, setSchedule)} placeholder={dict.daily.todaySchedulePlaceholder} className="w-full h-24 bg-white border border-gray-100 rounded-xl p-4 resize-none text-sm shadow-sm outline-none"></textarea>
      </section>

      {/* Routines */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-xl flex items-center gap-2"><RotateCw className="text-primary" size={22}/> {dict.daily.routine}</h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={async () => {
                const masterData = await getMasterRoutines(user?.uid || "");
                for (const m of masterData) {
                  if (!routines.some(r => r.text === m.text)) {
                    await saveRoutine(user!.uid, { text: m.text, date: todayStr, completed: false, achievement: 1 });
                  }
                }
              }}
              className="p-2 hover:bg-primary/5 rounded-full text-primary transition-colors"
              title="Sync Master Routines"
            >
              <RotateCw size={16} className={isDirty.routines ? "animate-spin" : ""} />
            </button>
            <Link href="/settings/routines" className="text-xs font-bold text-primary px-3 py-1.5 rounded-full border border-gray-100">{dict.daily.manageRoutines}</Link>
          </div>
        </div>
        <div className="space-y-3">
          {routines.map((routine) => {
            const currentLevel = routine.achievement || (routine.completed ? 5 : 1);
            const isExpanded = expandedRoutineId === routine.id;
            return (
              <div key={routine.id} className={`flex flex-col gap-3 p-4 rounded-2xl border border-gray-100 transition-all shadow-sm ${isExpanded ? "bg-primary/[0.02]" : "bg-white"}`}>
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedRoutineId(isExpanded ? null : routine.id)}>
                  <span className={`flex-1 text-base font-bold ${!isExpanded ? "truncate" : ""}`}>{routine.text}</span>
                  {!isExpanded && <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white ${getAchievementColor(currentLevel)}`}>{currentLevel}</div>}
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteRoutine(routine.id); }} className="text-muted-foreground p-1"><Trash2 size={16} /></button>
                </div>
                {isExpanded && (
                  <div className="space-y-4 pt-2 animate-in slide-in-from-top-2">
                    <div className="flex flex-wrap gap-2">
                       {[1,2,3,4,5].map(lv => (
                         <button key={lv} onClick={() => { handleUpdateRoutine(routine, { achievement: lv }); setExpandedRoutineId(null); }} className={`w-9 h-9 rounded-full text-xs font-black border-2 transition-all ${currentLevel === lv ? "text-white " + getAchievementColor(lv) + " border-transparent" : "bg-white text-muted-foreground border-gray-100"}`}>{lv}</button>
                       ))}
                    </div>
                    <input 
                      type="text" 
                      defaultValue={routine.comment || ""} 
                      onBlur={e => handleUpdateRoutine(routine, { comment: e.target.value })} 
                      placeholder="メモ..." 
                      className="w-full bg-transparent border-b border-gray-100 py-1 text-xs outline-none font-medium" 
                    />
                  </div>
                )}
              </div>
            );
          })}
          {showRoutineInput ? (
            <div className="flex gap-2">
              <input type="text" value={newRoutineText} onChange={e => setNewRoutineText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddRoutine()} placeholder="ルーティン名..." className="flex-1 border border-gray-100 rounded-xl p-3 text-sm shadow-sm" autoFocus />
              <button onClick={handleAddRoutine} className="bg-primary text-white px-4 rounded-xl font-bold text-sm">追加</button>
            </div>
          ) : (
            <button onClick={() => setShowRoutineInput(true)} className="text-sm text-muted-foreground py-2 flex items-center gap-2"><Plus size={16} /> {dict.daily.addRoutine}</button>
          )}
        </div>
      </section>

      {/* Todo */}
      <section className="space-y-4">
        <h2 className="font-bold text-xl flex items-center gap-2"><CheckCircle2 className="text-primary" size={22}/> {dict.daily.todo}</h2>
        <div className="space-y-3">
          {todos.map((todo) => {
            const currentLevel = todo.achievement || (todo.completed ? 5 : 1);
            const isExpanded = expandedTodoId === todo.id;
            return (
              <div key={todo.id} className={`flex flex-col gap-3 p-4 rounded-2xl border border-gray-100 transition-all shadow-sm ${isExpanded ? "bg-slate-50" : "bg-white"}`}>
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedTodoId(isExpanded ? null : todo.id)}>
                  <span className={`flex-1 text-base font-bold ${!isExpanded ? "truncate" : ""}`}>{todo.text}</span>
                  {!isExpanded && <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white ${getAchievementColor(currentLevel)}`}>{currentLevel}</div>}
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteTodo(todo.id); }} className="text-muted-foreground p-1"><Trash2 size={16} /></button>
                </div>
                {isExpanded && (
                  <div className="space-y-4 pt-2 animate-in slide-in-from-top-2">
                    <div className="flex flex-wrap gap-2">
                      {[1,2,3,4,5].map(lv => (
                        <button key={lv} onClick={() => { handleUpdateTodo(todo, { achievement: lv }); setExpandedTodoId(null); }} className={`w-9 h-9 rounded-full text-xs font-black border-2 transition-all ${currentLevel === lv ? "text-white " + getAchievementColor(lv) + " border-transparent" : "bg-white text-muted-foreground border-gray-100"}`}>{lv}</button>
                      ))}
                    </div>
                    <input 
                      type="text" 
                      defaultValue={todo.comment || ""} 
                      onBlur={e => handleUpdateTodo(todo, { comment: e.target.value })} 
                      placeholder="メモ..." 
                      className="w-full bg-transparent border-b border-gray-100 py-1 text-xs outline-none font-medium" 
                    />
                  </div>
                )}
              </div>
            );
          })}
          {showTodoInput ? (
            <div className="flex gap-2">
              <input type="text" value={newTodoText} onChange={e => setNewTodoText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddTodo()} placeholder="やること..." className="flex-1 border border-gray-100 rounded-xl p-3 text-sm shadow-sm" autoFocus />
              <button onClick={handleAddTodo} className="bg-primary text-white px-4 rounded-xl font-bold text-sm">追加</button>
            </div>
          ) : (
            <button onClick={() => setShowTodoInput(true)} className="text-sm text-muted-foreground py-2 flex items-center gap-2"><Plus size={16} /> {dict.daily.addTodo}</button>
          )}
        </div>
      </section>

      {/* 今日のデータ (Today's Data) */}
      <section className="space-y-4">
        <h2 className="font-bold text-xl flex items-center gap-2"><Target className="text-primary" size={22}/> 今日のデータ</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Link href="/study" className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-2">
              <div className="flex justify-between items-center text-muted-foreground"><span className="text-[10px] font-bold uppercase tracking-wider">{dict.daily.studyTime}</span><BarChart2 size={14} /></div>
              <div className="flex items-baseline gap-1 font-black text-xl">
                 {Math.floor((todayStudyMins || 0) / 60)}<span className="text-[10px]">h</span> {(todayStudyMins || 0) % 60}<span className="text-[10px]">m</span>
              </div>
            </Link>
            <Link href="/reading" className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-2">
              <div className="flex justify-between items-center text-muted-foreground"><span className="text-[10px] font-bold uppercase tracking-wider">{dict.daily.readingTime}</span><BookOpen size={14} /></div>
              <div className="flex items-baseline gap-1 font-black text-xl">
                 {Math.floor((todayReadingMins || 0) / 60)}<span className="text-[10px]">h</span> {(todayReadingMins || 0) % 60}<span className="text-[10px]">m</span>
              </div>
            </Link>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <section className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <button onClick={() => setIsSleepExpanded(!isSleepExpanded)} className="w-full p-5 flex flex-col items-center gap-2 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3 w-full justify-center">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Clock size={20} /></div>
                  <h2 className="font-bold text-sm">睡眠時間</h2>
                </div>
                <div className="flex flex-col items-center">
                   <p className="font-black text-xl">{sleepInfo.text}</p>
                   <p className="text-[10px] font-bold" style={{ color: sleepInfo.color }}>Healthy</p>
                </div>
              </button>
              {isSleepExpanded && (
                <div className="p-4 pt-0 border-t border-gray-50 grid grid-cols-1 gap-3 animate-in slide-in-from-top-2">
                   <div><label className="text-[10px] font-bold opacity-50 block mb-1 text-center">起床</label><input type="time" value={wakeTime} onChange={e => handleFieldChange("wakeTime", e.target.value, setWakeTime)} onBlur={() => saveField("wakeTime", wakeTime)} className="w-full p-2 border border-gray-100 rounded-xl text-xs font-bold text-center" /></div>
                   <div><label className="text-[10px] font-bold opacity-50 block mb-1 text-center">就寝</label><input type="time" value={bedTime} onChange={e => handleFieldChange("bedTime", e.target.value, setBedTime)} onBlur={() => saveField("bedTime", bedTime)} className="w-full p-2 border border-gray-100 rounded-xl text-xs font-bold text-center" /></div>
                </div>
              )}
            </section>

            <section className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-3">
               <div className="flex items-center gap-2">
                  <Smartphone size={18} className="text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{dict.daily.phoneTime}</span>
               </div>
               <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-1 font-black text-xl">
                     {Math.floor(phoneTimeMins / 60)}<span className="text-[10px]">h</span> {phoneTimeMins % 60}<span className="text-[10px]">m</span>
                  </div>
                  {renderTimeSelectors(phoneTimeMins, val => handleFieldChange("phoneTimeMins", val, setPhoneTimeMins))}
               </div>
            </section>
          </div>
        </div>
      </section>

      {/* Reflection */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-xl flex items-center gap-2"><Edit3 className="text-primary" size={22}/> {dict.daily.reflection}</h2>
          {(isDirty.diary || isDirty.dinner || isDirty.phoneTimeMins) && <button onClick={async () => { if (isDirty.diary) await saveField('diary', diary); if (isDirty.dinner) await saveField('dinner', dinner); if (isDirty.phoneTimeMins) await saveField('phoneTimeMins', phoneTimeMins); }} className="bg-primary text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">保存</button>}
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 space-y-4 shadow-sm">
          <div className="space-y-1">
             <label className="text-[10px] font-bold opacity-50 flex items-center gap-1"><Utensils size={10}/> {dict.daily.dinner}</label>
             <input type="text" value={dinner} onChange={e => handleFieldChange('dinner', e.target.value, setDinner)} placeholder="..." className="w-full bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm outline-none font-medium" />
          </div>
          <div className="pt-2">
             <label className="text-[10px] font-bold opacity-50 block mb-1">{dict.daily.diary}</label>
             <textarea value={diary} onChange={e => handleFieldChange('diary', e.target.value, setDiary)} className="w-full h-32 bg-gray-50 border border-gray-100 p-4 rounded-xl text-sm resize-none outline-none"></textarea>
          </div>
        </div>
      </div>

      {/* Fulfillment Summary (VERY BOTTOM) */}
      <section className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl space-y-4 animate-in slide-in-from-bottom-4 duration-700">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="font-black text-xl text-foreground tracking-tight">{dict.daily.fulfillment}</h2>
            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Calculated from routines & todos</p>
          </div>
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center text-white font-black text-2xl shadow-xl transition-all scale-110" style={{ backgroundColor: `hsl(${220 - (progressPercent * 2.2)}, 80%, 65%)` }}>
            {progressPercent}%
          </div>
        </div>
        <div className="relative h-6 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
          <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: `hsl(${220 - (progressPercent * 2.2)}, 80%, 65%)` }} />
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-foreground/40 pointer-events-none uppercase tracking-widest">
            {progressPercent < 50 ? "Keep going!" : progressPercent < 80 ? "Good Job" : "Excellent!"}
          </div>
        </div>
      </section>
    </div>
  );
}
