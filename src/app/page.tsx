"use client";

import { useState, Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, Smartphone, BookOpen, Moon, Sun, Edit3, Plus, RotateCw, ListTodo, CalendarClock, CalendarDays, Utensils, ChevronLeft, ChevronRight, ChevronDown, Flag, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { collection, doc, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import {
  saveRoutine, deleteRoutine, toggleRoutineCompletion, RoutineItem,
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
  
  const [targetStudyMins, setTargetStudyMins] = useState(120);
  const [todayStudyMins, setTodayStudyMins] = useState<number | null>(null);
  const [dailyLogLoaded, setDailyLogLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const { user } = useAuth();
  const todayStr = format(displayDate, "yyyy-MM-dd");

  // 無限ループ防止用の最後に保存/同期されたデータの状態
  const lastKnownDataRef = useRef<string>("");

  // 指定されたデータを即時保存する関数
  const saveNow = async (data: any) => {
    if (!user || !dailyLogLoaded) return;
    const dataStr = JSON.stringify({ ...data, todayStr });
    if (dataStr === lastKnownDataRef.current) return;

    try {
      setIsSyncing(true);
      lastKnownDataRef.current = dataStr;
      console.log("[Compass] Saving change:", todayStr);
      await saveDailyLog(user.uid, todayStr, data);
    } catch (err) {
      console.error("[Compass] Save failed:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // 全データをまとめて保存（Blur時やページ離脱時に使用）
  const flushSave = () => {
    const data = {
      schedule, wakeTime, bedTime, dinner, diary,
      fulfillment: progressPercent
    };
    saveNow(data);
  };

  // DailyLogをonSnapshotでリアルタイム取得（1日の情報のみ）
  useEffect(() => {
    if (!user) return;
    setDailyLogLoaded(false);

    const docRef = doc(db, `users/${user.uid}/dailyLogs`, todayStr);
    const unsub = onSnapshot(docRef, { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.exists()) {
        const log = snapshot.data();
        const dataForRef = {
          schedule: log.schedule || "",
          wakeTime: log.wakeTime || "07:00",
          bedTime: log.bedTime || "23:30",
          dinner: log.dinner || "",
          diary: log.diary || "",
          fulfillment: log.fulfillment ?? 50
        };
        
        const dataStr = JSON.stringify({ ...dataForRef, todayStr });
        
        // 自分が保存した直後の更新や、現在自分の端末で入力中の書き込みでなければ状態に反映
        if (dataStr !== lastKnownDataRef.current && !snapshot.metadata.hasPendingWrites) {
          lastKnownDataRef.current = dataStr;
          setSchedule(dataForRef.schedule);
          setWakeTime(dataForRef.wakeTime);
          setBedTime(dataForRef.bedTime);
          setDinner(dataForRef.dinner);
          setDiary(dataForRef.diary);
          setProgressPercent(dataForRef.fulfillment);
        }
      }
      setDailyLogLoaded(true);
    });

    return () => unsub();
  }, [user, todayStr]);

  // ページを離れる際やアンマウント時の保護
  useEffect(() => {
    const handleBeforeUnload = () => flushSave();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushSave(); // アンマウント時（ページ移動時）に保存
    };
  }, [user, todayStr, dailyLogLoaded, schedule, wakeTime, bedTime, dinner, diary, progressPercent]);

  // 手動リロード（強制同期）
  const handleForceSync = () => {
    window.location.reload();
  };

  // ルーティンをFirebaseからリアルタイム取得
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, `users/${user.uid}/routines`),
      where("date", "==", todayStr)
    );
    const unsub = onSnapshot(q, (snap) => {
      setRoutines(snap.docs.map(d => ({ id: d.id, ...d.data() } as RoutineItem)));
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

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-10 animate-in fade-in zoom-in-95 duration-500 pb-32">
      <header>
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-end gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
              {dict.daily.title}
            </h1>
            <div className="flex items-center gap-2 pb-1">
              <span className="text-lg text-muted-foreground font-semibold">
                {format(displayDate, "MM/dd (E)")}
              </span>
              <button 
                onClick={handleForceSync}
                className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-primary transition-all active:rotate-180 duration-500"
                title="Force Sync / Reload"
              >
                <RotateCw size={18} className={isSyncing ? "animate-spin text-primary" : ""} />
              </button>
            </div>
          </div>
        </div>
        <Link href="/calendar" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-border rounded-full text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/50 shadow-sm transition-all group">
          <CalendarDays size={14} className="text-primary/70 group-hover:text-primary transition-colors" /> {dict.daily.selectAnotherDay}
        </Link>
      </header>

      {/* Today's Schedule */}
      <section>
        <h2 className="font-semibold text-xl mb-3 flex items-center gap-2">
          <CalendarClock className="text-primary" size={22}/> 
          {dict.daily.todaySchedule}
        </h2>
        <textarea 
          value={schedule}
          onChange={e => setSchedule(e.target.value)}
          onBlur={flushSave}
          placeholder={dict.daily.todaySchedulePlaceholder}
          className="w-full h-24 bg-white border border-border rounded-xl p-4 resize-none shadow-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm leading-relaxed"
        ></textarea>
      </section>

      {/* Routines & Todos (Simplified for brevity, but they sync via separate firestore collections) */}
      <section className="space-y-8">
        <div>
          <h2 className="font-semibold text-xl mb-3 flex items-center gap-2">
            <RotateCw className="text-primary" size={22}/> 
            {dict.daily.routine}
          </h2>
          <div className="space-y-3">
            {routines.map((routine) => (
              <div key={routine.id} className={`flex items-center gap-3 p-4 rounded-xl transition-all border ${routine.completed ? "bg-muted/30 border-transparent text-muted-foreground/60" : "bg-white border-border shadow-sm"}`}>
                <button onClick={() => handleToggleRoutine(routine)} className="shrink-0">{routine.completed ? <CheckCircle2 className="text-primary" size={22} /> : <Circle className="text-muted-foreground" size={22} />}</button>
                <span className={`flex-1 text-base leading-tight ${routine.completed ? "line-through" : "font-medium text-foreground"}`}>{routine.text}</span>
                <button onClick={() => handleDeleteRoutine(routine.id)} className="text-muted-foreground hover:text-red-500 p-1 transition-colors"><Trash2 size={16} /></button>
              </div>
            ))}
            {showRoutineInput ? (
              <div className="flex gap-2 animate-in slide-in-from-top-2">
                <input type="text" value={newRoutineText} onChange={e => setNewRoutineText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddRoutine()} placeholder="ルーティンを入力..." className="flex-1 border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" autoFocus />
                <button onClick={handleAddRoutine} className="bg-primary text-white px-4 rounded-xl font-bold text-sm">追加</button>
                <button onClick={() => { setShowRoutineInput(false); setNewRoutineText(""); }} className="text-muted-foreground px-2">✕</button>
              </div>
            ) : (
              <button onClick={() => setShowRoutineInput(true)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors py-2 px-1">
                <Plus size={16} /> {dict.daily.addRoutine}
              </button>
            )}
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-xl mb-3 flex items-center gap-2">
            <ListTodo className="text-primary" size={22}/> 
            {dict.daily.todo}
          </h2>
          <div className="space-y-3">
            {todos.map((todo) => (
              <div key={todo.id} className={`flex items-center gap-3 p-4 rounded-xl transition-all border ${todo.completed ? "bg-muted/30 border-transparent text-muted-foreground/60" : "bg-white border-border shadow-sm"}`}>
                <button onClick={() => handleToggleTodo(todo)} className="shrink-0">{todo.completed ? <CheckCircle2 className="text-primary" size={22} /> : <Circle className="text-muted-foreground" size={22} />}</button>
                <span className={`flex-1 text-base leading-tight ${todo.completed ? "line-through" : "font-medium text-foreground"}`}>{todo.text}</span>
                <button onClick={() => handleDeleteTodo(todo.id)} className="text-muted-foreground hover:text-red-500 p-1 transition-colors"><Trash2 size={16} /></button>
              </div>
            ))}
            {showTodoInput ? (
              <div className="flex gap-2 animate-in slide-in-from-top-2">
                <input type="text" value={newTodoText} onChange={e => setNewTodoText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddTodo()} placeholder="やることを入力..." className="flex-1 border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" autoFocus />
                <button onClick={handleAddTodo} className="bg-primary text-white px-4 rounded-xl font-bold text-sm">追加</button>
                <button onClick={() => { setShowTodoInput(false); setNewTodoText(""); }} className="text-muted-foreground px-2">✕</button>
              </div>
            ) : (
              <button onClick={() => setShowTodoInput(true)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors py-2 px-1">
                <Plus size={16} /> {dict.daily.addTodo}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Study Time Section */}
      <section>
        <h2 className="font-semibold text-xl mb-3 flex items-center gap-2">
          <BookOpen className="text-primary" size={22}/> 
          勉強時間
        </h2>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-border flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <label className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <Flag size={16} className="text-amber-500" />
              朝の目標
            </label>
            <div className="flex gap-2">
              <div className="flex bg-muted/30 border border-border rounded-lg overflow-hidden focus-within:border-primary">
                <select 
                  value={Math.floor(targetStudyMins / 60)} 
                  onChange={(e) => {
                    const newTotal = Number(e.target.value) * 60 + (targetStudyMins % 60);
                    setTargetStudyMins(newTotal);
                    // 達成率はDailyLogには含まず目標自体はローカルステート（または後でDB化）
                  }}
                  className="bg-transparent px-2 py-2 text-sm font-bold outline-none"
                >
                  {[...Array(25)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                </select>
                <span className="flex items-center text-[10px] text-muted-foreground pr-2 font-bold pointer-events-none">h</span>
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between px-1">
            <Link href="/study" className="flex flex-col group cursor-pointer">
              <span className="text-[11px] font-bold text-primary/80 mb-1 flex items-center gap-1 uppercase tracking-wider">
                現在実績 <ChevronRight size={12}/>
              </span>
              <div className="text-4xl font-extrabold text-foreground group-hover:text-primary transition-colors flex items-baseline gap-1">
                {todayStudyMins === null ? <span className="text-xl animate-pulse">...</span> : <>{Math.floor(todayStudyMins / 60)}<span className="text-lg font-bold">h</span> {todayStudyMins % 60}<span className="text-lg font-bold">m</span></>}
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Evening Reflection & Diary */}
      <section>
        <h2 className="font-semibold text-xl mb-3 flex items-center gap-2">
          <Edit3 className="text-primary" size={22}/> 
          {dict.daily.reflection}
        </h2>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-border space-y-5">
          <div className="flex flex-col sm:flex-row gap-5 pb-4 border-b border-border/50">
            <div className="space-y-2 flex-1 pb-0">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                <Utensils size={14} className="text-amber-500" /> {dict.daily.dinner}
              </label>
              <input 
                type="text" 
                value={dinner}
                onChange={e => setDinner(e.target.value)}
                onBlur={flushSave}
                placeholder={dict.daily.dinnerPlaceholder}
                className="w-full bg-background border border-border rounded-lg p-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2 uppercase tracking-wider"><Edit3 size={14} className="text-blue-500"/> {dict.daily.diary}</label>
            <textarea 
              value={diary}
              onChange={e => setDiary(e.target.value)}
              onBlur={flushSave}
              placeholder={dict.daily.diaryPlaceholder}
              className="w-full h-32 bg-background border border-border rounded-xl p-4 resize-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm leading-relaxed"
            ></textarea>
          </div>
        </div>
      </section>

      {/* Sleep & Wake */}
      <section>
        <div 
          onClick={() => setIsSleepExpanded(!isSleepExpanded)}
          className={`bg-white rounded-2xl shadow-sm border transition-all cursor-pointer select-none ${isSleepExpanded ? "border-primary/40 p-5" : "border-border p-4"}`}
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
              <ChevronDown size={18} className={`text-muted-foreground transition-transform duration-300 ${isSleepExpanded ? "rotate-180" : ""}`} />
            </div>
          </div>

          <div className={`grid transition-all duration-300 ease-in-out ${isSleepExpanded ? "grid-rows-[1fr] opacity-100 mt-5 pt-5 border-t border-border" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
               <div className="flex flex-col sm:flex-row gap-5">
                 <div className="space-y-1.5 flex-1">
                   <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Sun size={14}/> {dict.daily.wakeTime}</label>
                   <input 
                     type="time" 
                     value={wakeTime} 
                     onChange={(e) => {
                        const newVal = e.target.value;
                        setWakeTime(newVal);
                        saveNow({ schedule, wakeTime: newVal, bedTime, dinner, diary, fulfillment: progressPercent });
                     }}
                     className="w-full bg-background border border-border rounded-lg p-3 text-sm" 
                   />
                 </div>
                 <div className="space-y-1.5 flex-1">
                   <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Moon size={14}/> {dict.daily.bedTime}</label>
                   <input 
                     type="time" 
                     value={bedTime} 
                     onChange={(e) => {
                        const newVal = e.target.value;
                        setBedTime(newVal);
                        saveNow({ schedule, wakeTime, bedTime: newVal, dinner, diary, fulfillment: progressPercent });
                     }}
                     className="w-full bg-background border border-border rounded-lg p-3 text-sm" 
                   />
                 </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Manual Fulfillment Slider */}
      <section className="bg-white p-5 rounded-2xl shadow-sm border border-border">
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
          onMouseUp={flushSave}
          onTouchEnd={flushSave}
          style={{ backgroundImage: `linear-gradient(to right, ${progressColor} ${progressPercent}%, var(--muted) ${progressPercent}%)` }}
          className="w-full h-4 bg-muted rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2"
        />
      </section>

      {/* Diagnosis Section (Very bottom, subtle) */}
      <footer className="mt-16 pt-8 border-t border-border flex flex-col items-center gap-4 text-center pb-8">
        <details className="w-full group">
          <summary className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest cursor-pointer hover:text-primary list-none list-inside opacity-50 hover:opacity-100 transition-opacity">
            <span className="flex items-center justify-center gap-2">
               <CheckCircle2 size={10}/> Diagnosis & Sync Parity
            </span>
          </summary>
          <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-border/50 text-[10px] font-mono text-left space-y-2 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex justify-between border-b border-border/30 pb-1">
              <span className="text-muted-foreground">PROJECT ID:</span>
              <span className="font-bold text-foreground truncate ml-4">{process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}</span>
            </div>
            <div className="flex justify-between border-b border-border/30 pb-1">
              <span className="text-muted-foreground">USER ID:</span>
              <span className="font-bold text-foreground break-all ml-4">{user?.uid}</span>
            </div>
            <div className="flex justify-between border-b border-border/30 pb-1">
              <span className="text-muted-foreground">DOC KEY:</span>
              <span className="font-bold text-primary ml-4">{todayStr}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">SYNC STATUS:</span>
              <span className={`font-bold flex items-center gap-1 ${isSyncing ? "text-amber-500" : "text-emerald-500"}`}>
                {isSyncing ? "SAVING..." : "LIVE & SYNCED"}
              </span>
            </div>
          </div>
        </details>
        <p className="text-[9px] text-muted-foreground/40 font-medium">Compass / Digital Architecture v1.1</p>
      </footer>
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
