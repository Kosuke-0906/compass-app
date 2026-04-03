"use client";

import { useState, Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, Smartphone, BookOpen, Moon, Sun, Edit3, Plus, RotateCw, ListTodo, CalendarClock, CalendarDays, Utensils, ChevronLeft, ChevronRight, ChevronDown, Flag, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { collection, doc, query, where, onSnapshot, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import {
  saveRoutine, deleteRoutine, toggleRoutineCompletion, RoutineItem, MasterRoutine, getMasterRoutines,
  saveTodo, deleteTodo, toggleTodoCompletion, TodoItem,
  saveDailyLog
} from "@/lib/firebase/db";

function DailyContent() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const displayDate = dateParam ? parseISO(dateParam) : new Date();
  const { dict } = useLanguage();

  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newRoutineText, setNewRoutineText] = useState("");
  const [newTodoText, setNewTodoText] = useState("");
  const [showRoutineInput, setShowRoutineInput] = useState(false);
  const [showTodoInput, setShowTodoInput] = useState(false);

  const [progressPercent, setProgressPercent] = useState(50);
  const [wakeTime, setWakeTime] = useState("07:00");
  const [bedTime, setBedTime] = useState("23:30");
  const [isSleepExpanded, setIsSleepExpanded] = useState(false);
  const [schedule, setSchedule] = useState("");
  const [dinner, setDinner] = useState("");
  const [diary, setDiary] = useState("");
  const [phoneTimeMins, setPhoneTimeMins] = useState(0);
  
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
        
        // 重要：LocalStorageに「書きかけ」のデータがない項目だけを上書き更新する
        // これにより、自分の入力が古いデータで消されるのを完全に防ぐ
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

  // 個別保存処理（クラウドへ同期）
  const saveField = async (fieldName: string, value: any) => {
    if (!user) return;
    setIsSavingField(prev => ({ ...prev, [fieldName]: true }));
    try {
      await saveDailyLog(user.uid, todayStr, { [fieldName]: value });
      
      // クラウド保存に成功したら、LocalStorageのバックアップからその項目を消去する
      const savedDraft = localStorage.getItem(getDraftKey());
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        delete draft[fieldName];
        if (Object.keys(draft).length === 0) {
          localStorage.removeItem(getDraftKey());
        } else {
          localStorage.setItem(getDraftKey(), JSON.stringify(draft));
        }
      }
      
      setIsDirty(prev => ({ ...prev, [fieldName]: false }));
    } catch (err) {
      console.error(`[Compass] Save ${fieldName} failed:`, err);
      alert(`保存に失敗しました。バックアップはブラウザに残っています。: ${err}`);
    } finally {
      setIsSavingField(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  // 入力変更時の処理（Dirtyフラグ + LocalStorageバックアップ）
  const handleFieldChange = (fieldName: string, value: any, setter: (v: any) => void) => {
    setter(value);
    setIsDirty(prev => ({ ...prev, [fieldName]: true }));
    
    // 即座にLocalStorageへバックアップ
    if (user) {
      const savedDraft = localStorage.getItem(getDraftKey());
      const draft = savedDraft ? JSON.parse(savedDraft) : {};
      draft[fieldName] = value;
      localStorage.setItem(getDraftKey(), JSON.stringify(draft));
    }
  };

  // ルーティンをFirebaseからリアルタイム取得 + 既定の同期
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, `users/${user.uid}/routines`),
      where("date", "==", todayStr)
    );
    const unsub = onSnapshot(q, async (snap) => {
      const dayRoutines = snap.docs.map(d => ({ id: d.id, ...d.data() } as RoutineItem));
      
      // もし今日のルーティンが空なら、既定のルーティンをコピーする
      if (dayRoutines.length === 0) {
        const masters = await getMasterRoutines(user.uid);
        if (masters.length > 0) {
          // Promise.allで一括保存
          await Promise.all(masters.map(m => 
            saveRoutine(user.uid, { text: m.text, date: todayStr, completed: false })
          ));
          // onSnapshotが再度発火して更新される
        }
      }
      
      setRoutines(dayRoutines);
    });
    return () => unsub();
  }, [user, todayStr]);

  // 今日の読書記録をFirebaseからリアルタイム取得
  useEffect(() => {
    if (!user) return;
    const qLogs = query(
      collection(db, `users/${user.uid}/readingLogs`),
      where("date", "==", todayStr)
    );
    const unsub = onSnapshot(qLogs, (snap) => {
      let total = 0;
      snap.forEach(doc => { total += doc.data().durationMins || 0; });
      setTodayReadingMins(total);
    });
    return () => unsub();
  }, [user, todayStr]);

  // ToDoをFirebaseからリアルタイム取得
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, `users/${user.uid}/todos`),
      where("date", "==", todayStr)
    );
    const unsub = onSnapshot(q, (snap) => {
      setTodos(snap.docs.map(d => ({ id: d.id, ...d.data() } as TodoItem)));
    });
    return () => unsub();
  }, [user, todayStr]);

  const handleAddRoutine = async () => {
    if (!user || !newRoutineText.trim()) return;
    await saveRoutine(user.uid, { text: newRoutineText.trim(), date: todayStr, completed: false });
    setNewRoutineText("");
    setShowRoutineInput(false);
  };

  const handleAddTodo = async () => {
    if (!user || !newTodoText.trim()) return;
    await saveTodo(user.uid, { text: newTodoText.trim(), date: todayStr, completed: false });
    setNewTodoText("");
    setShowTodoInput(false);
  };

  const handleToggleRoutine = async (r: RoutineItem) => {
    if (!user) return;
    await toggleRoutineCompletion(user.uid, r.id, !r.completed);
  };

  const handleToggleTodo = async (t: TodoItem) => {
    if (!user) return;
    await toggleTodoCompletion(user.uid, t.id, !t.completed);
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
    } else {
      sleepHue = Math.min(260, 120 + ((durationMins - 450) * 1.2));
    }
    
    const baseColor = `hsl(${sleepHue} 85% 40%)`;
    const bgColor = `hsl(${sleepHue} 85% 40% / 0.1)`;
    const borderColor = `hsl(${sleepHue} 85% 40% / 0.3)`;

    return { text: `${h}h ${m}m`, color: baseColor, bg: bgColor, border: borderColor };
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
  
  // 今日の学習記録をFirebaseからリアルタイム取得
  useEffect(() => {
    if (!user) return;
    
    const qLogs = query(
      collection(db, `users/${user.uid}/studyLogs`),
      where("date", "==", todayStr)
    );
    
    const unsubscribe = onSnapshot(qLogs, (snapshot) => {
      let total = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        total += data.durationMins || 0;
      });
      setTodayStudyMins(total);
    });

    return () => unsubscribe();
  }, [user, todayStr]);

  // 勉強時間の達成率計算
  const achievementRate = targetStudyMins > 0 ? Math.floor(((todayStudyMins || 0) / targetStudyMins) * 100) : 0;
  const clampRate = Math.min(achievementRate, 100);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-10 animate-in fade-in zoom-in-95 duration-500 pb-24 relative">
      {/* 個別の保存中表示は不要にし、ボタン内で表現するように変更 */}

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
        <div className="mb-3">
          <h2 className="font-semibold text-xl flex items-center gap-2">
            <RotateCw className="text-primary" size={22}/> 
            {dict.daily.routine}
          </h2>
          <Link href="/settings/routines" className="text-xs font-bold text-primary hover:bg-primary/5 px-3 py-1.5 rounded-full border border-primary/20 transition-all">
             {dict.daily.manageRoutines}
          </Link>
        </div>
        <div className="space-y-3">
          {routines.map((routine) => (
             <div 
               key={routine.id} 
               className={`flex items-center gap-3 p-4 rounded-xl transition-all border ${
                 routine.completed 
                   ? "bg-muted/30 border-transparent text-muted-foreground/60" 
                   : "bg-white border-border shadow-sm"
               }`}
             >
               <button onClick={() => handleToggleRoutine(routine)} className="shrink-0">
                 {routine.completed ? <CheckCircle2 className="text-primary" size={22} /> : <Circle className="text-muted-foreground" size={22} />}
               </button>
               <span className={`flex-1 text-base leading-tight ${routine.completed ? "line-through" : "font-medium text-foreground"}`}>
                 {routine.text}
               </span>
               <button onClick={() => handleDeleteRoutine(routine.id)} className="text-muted-foreground hover:text-red-500 p-1 transition-colors">
                 <Trash2 size={16} />
               </button>
             </div>
          ))}
          {showRoutineInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newRoutineText}
                onChange={e => setNewRoutineText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddRoutine()}
                placeholder="ルーティンを入力..."
                className="flex-1 border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
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

      {/* Todos */}
      <section>
        <div className="mb-3">
          <h2 className="font-semibold text-xl flex items-center gap-2">
            <ListTodo className="text-primary" size={22}/> 
            {dict.daily.todo}
          </h2>
        </div>
        <div className="space-y-3">
          {todos.map((todo) => (
             <div 
               key={todo.id} 
               className={`flex items-center gap-3 p-4 rounded-xl transition-all border ${
                 todo.completed 
                   ? "bg-muted/30 border-transparent text-muted-foreground/60" 
                   : "bg-white border-border shadow-sm"
               }`}
             >
               <button onClick={() => handleToggleTodo(todo)} className="shrink-0">
                 {todo.completed ? <CheckCircle2 className="text-primary" size={22} /> : <Circle className="text-muted-foreground" size={22} />}
               </button>
               <span className={`flex-1 text-base leading-tight ${todo.completed ? "line-through" : "font-medium text-foreground"}`}>
                 {todo.text}
               </span>
               <button onClick={() => handleDeleteTodo(todo.id)} className="text-muted-foreground hover:text-red-500 p-1 transition-colors">
                 <Trash2 size={16} />
               </button>
             </div>
          ))}
          {showTodoInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newTodoText}
                onChange={e => setNewTodoText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddTodo()}
                placeholder="やることを入力..."
                className="flex-1 border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
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

      {/* Study Time 独立セクション (睡眠時間と入れ替え＆高度化) */}
      <section>
        <h2 className="font-semibold text-xl mb-3 flex items-center gap-2">
          <BookOpen className="text-primary" size={22}/> 
          勉強時間
        </h2>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-border flex flex-col gap-5">
          {/* 目標入力 */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <label className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <Flag size={16} className="text-amber-500" />
              朝の目標
            </label>
            <div className="flex gap-2">
              <div className="flex bg-muted/30 border border-border rounded-lg overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <select 
                  value={Math.floor(targetStudyMins / 60)} 
                  onChange={(e) => setTargetStudyMins(Number(e.target.value) * 60 + (targetStudyMins % 60))}
                  className="bg-transparent px-2 py-2 text-sm font-bold text-foreground outline-none appearance-none cursor-pointer"
                >
                  {[...Array(25)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                </select>
                <span className="flex items-center text-[10px] text-muted-foreground pr-2 font-bold pointer-events-none select-none">h</span>
              </div>
              <div className="flex bg-muted/30 border border-border rounded-lg overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <select 
                   value={targetStudyMins % 60} 
                   onChange={(e) => setTargetStudyMins(Math.floor(targetStudyMins / 60) * 60 + Number(e.target.value))}
                   className="bg-transparent px-2 py-2 text-sm font-bold text-foreground outline-none appearance-none cursor-pointer"
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>)}
                </select>
                <span className="flex items-center text-[10px] text-muted-foreground pr-2 font-bold pointer-events-none select-none">m</span>
              </div>
            </div>
          </div>

          {/* 実績と達成率 */}
          <div className="flex items-end justify-between px-1">
            <Link href="/study" className="flex flex-col group cursor-pointer">
              <span className="text-[11px] font-bold text-primary/80 mb-1 flex items-center gap-1 uppercase tracking-wider">
                現在実績 (タップで個別入力) <ChevronRight size={12}/>
              </span>
              <div className="text-4xl font-extrabold text-foreground group-hover:text-primary transition-colors flex items-baseline gap-1">
                {todayStudyMins === null ? (
                  <span className="text-xl animate-pulse text-muted-foreground">計算中...</span>
                ) : (
                  <>
                    {Math.floor(todayStudyMins / 60)}<span className="text-lg font-bold">h</span> {todayStudyMins % 60}<span className="text-lg font-bold">m</span>
                  </>
                )}
              </div>
            </Link>
            
            <div className="text-right flex flex-col items-end">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">達成率</span>
              <span 
                className="text-3xl font-black italic tracking-tighter"
                style={{ color: achievementRate >= 100 ? '#8b5cf6' : 'var(--primary)' }}
              >
                {achievementRate}%
              </span>
            </div>
          </div>

          {/* プログレスプロット */}
          <div className="space-y-2">
            <div className="h-3 w-full bg-muted/60 rounded-full overflow-hidden relative shadow-inner">
              <div 
                className="absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out"
                style={{ 
                  width: `${clampRate}%`, 
                  backgroundImage: achievementRate >= 100 
                    ? 'linear-gradient(to right, #6366f1, #a855f7, #ec4899)' // 100%超えは鮮やかなグラデ
                    : 'linear-gradient(to right, #93c5fd, #3b82f6)', // 青色のグラデーション
                }}
              />
            </div>
            {achievementRate >= 100 && (
              <p className="text-xs text-right font-bold text-purple-500 animate-in fade-in slide-in-from-bottom-1">
                🎉 目標達成おめでとうございます！
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Reading Time Section */}
      <section>
        <h2 className="font-semibold text-xl mb-3 flex items-center gap-2">
          <BookOpen className="text-primary" size={22}/> 
          {dict.daily.readingTime}
        </h2>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-border flex flex-col gap-4">
          <div className="flex items-end justify-between px-1">
            <Link href="/reading" className="flex flex-col group cursor-pointer">
              <span className="text-[11px] font-bold text-primary/80 mb-1 flex items-center gap-1 uppercase tracking-wider">
                {dict.daily.readingTracker} <ChevronRight size={12}/>
              </span>
              <div className="text-4xl font-extrabold text-foreground group-hover:text-primary transition-colors flex items-baseline gap-1">
                {todayReadingMins === null ? (
                  <span className="text-xl animate-pulse text-muted-foreground">読み込み中...</span>
                ) : (
                  <>
                    {Math.floor(todayReadingMins / 60)}<span className="text-lg font-bold">h</span> {todayReadingMins % 60}<span className="text-lg font-bold">m</span>
                  </>
                )}
              </div>
            </Link>
            
            <div className="bg-primary/5 p-3 rounded-2xl">
               <BookOpen size={24} className="text-primary opacity-40" />
            </div>
          </div>
        </div>
      </section>

      {/* Evening Reflection & Diary */}
      <section>
        <div className="flex items-center justify-between mb-3">
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
      </section>

      {/* Sleep & Wake (入れ替え＆アコーディオン化) */}
      <section>
        <div 
          onClick={() => setIsSleepExpanded(!isSleepExpanded)}
          className={`bg-white rounded-2xl shadow-sm border transition-all cursor-pointer select-none
            ${isSleepExpanded ? "border-primary/40 ring-2 ring-primary/10 p-5" : "border-border hover:border-primary/30 p-4"}
          `}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg flex items-center gap-2 text-foreground">
              <Moon className="text-primary" size={20}/> 
              睡眠時間
            </h2>
            <div className="flex items-center gap-3">
              <span className="font-bold border px-3 py-1 rounded-lg text-sm" style={{ color: sleepInfo.color, borderColor: sleepInfo.border, backgroundColor: sleepInfo.bg }}>
                {sleepInfo.text}
              </span>
              <div className={`p-1 rounded-full hover:bg-muted transition-colors ${isSleepExpanded ? "bg-muted" : ""}`}>
                <ChevronDown size={18} className={`text-muted-foreground transition-transform duration-300 ${isSleepExpanded ? "rotate-180" : ""}`} />
              </div>
            </div>
          </div>

          {/* 展開される入力エリア */}
          <div className={`grid transition-all duration-300 ease-in-out ${isSleepExpanded ? "grid-rows-[1fr] opacity-100 mt-5 pt-5 border-t border-border" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
               <div className="flex flex-col sm:flex-row gap-5">
                 <div className="space-y-1.5 flex-1">
                   <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Sun size={14}/> {dict.daily.wakeTime}</label>
                   <input 
                     type="time" 
                     value={wakeTime} 
                     step="300"
                     onChange={(e) => handleFieldChange('wakeTime', e.target.value, setWakeTime)}
                     className="w-full bg-background border border-border rounded-lg p-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium text-foreground cursor-pointer" 
                   />
                 </div>
                 <div className="space-y-1.5 flex-1">
                   <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Moon size={14}/> {dict.daily.bedTime}</label>
                   <input 
                     type="time" 
                     value={bedTime} 
                     step="300"
                     onChange={(e) => handleFieldChange('bedTime', e.target.value, setBedTime)}
                     className="w-full bg-background border border-border rounded-lg p-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium text-foreground cursor-pointer" 
                   />
                 </div>
               </div>
               {(isDirty.wakeTime || isDirty.bedTime) && (
                 <button 
                   onClick={async () => {
                     if (isDirty.wakeTime) await saveField('wakeTime', wakeTime);
                     if (isDirty.bedTime) await saveField('bedTime', bedTime);
                   }}
                   className="w-full mt-4 py-2 bg-primary text-white rounded-xl text-xs font-bold transition-all"
                 >
                   睡眠時間を保存
                 </button>
               )}
            </div>
          </div>
        </div>
      </section>

      {/* Manual Fulfillment Slider */}
      <section className="bg-white p-5 rounded-2xl shadow-sm border border-border transition-all">
        <label htmlFor="fulfillment-slider" className="flex justify-between items-end mb-4 cursor-pointer">
          <h2 className="font-semibold text-xl text-foreground tracking-tight">{dict.daily.fulfillment}</h2>
          <span className="font-bold text-3xl" style={{ color: progressColor }}>{progressPercent}%</span>
        </label>
        
        <input 
          id="fulfillment-slider"
          type="range" 
          min="0" 
          max="100" 
          value={progressPercent}
          onChange={(e) => setProgressPercent(Number(e.target.value))}
          onMouseUp={() => saveField('fulfillment', progressPercent)}
          onTouchEnd={() => saveField('fulfillment', progressPercent)}
          style={{ 
            backgroundImage: `linear-gradient(to right, ${progressColor} ${progressPercent}%, var(--muted) ${progressPercent}%)` 
          }}
          className="w-full h-4 bg-muted rounded-full appearance-none outline-none cursor-pointer transition-all duration-300 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-125"
        />
        <style jsx>{`
          input[type=range]::-webkit-slider-thumb {
            border-color: ${progressColor};
          }
        `}</style>
      </section>
      
    </div>
  );
}

export default function DailyPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center animate-pulse">Loading...</div>}>
      <DailyContent />
    </Suspense>
  )
}
