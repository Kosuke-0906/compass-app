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
  ChevronRight,
  TrendingUp,
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
  
  const [todayStudyMins, setTodayStudyMins] = useState<number | null>(null);
  const [todayReadingMins, setTodayReadingMins] = useState<number | null>(null);
  const [dailyLogLoaded, setDailyLogLoaded] = useState(false);
  const [isSavingField, setIsSavingField] = useState<Record<string, boolean>>({});
  const [isDirty, setIsDirty] = useState<Record<string, boolean>>({});

  const { user } = useAuth();
  const todayStr = format(displayDate, "yyyy-MM-dd");
  const getDraftKey = () => `compass_draft_${user?.uid}_${todayStr}`;

  useEffect(() => {
    if (!user) return;
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
        const dirtyFields: Record<string, boolean> = {};
        Object.keys(draft).forEach(k => dirtyFields[k] = true);
        setIsDirty(prev => ({ ...prev, ...dirtyFields }));
      } catch (e) { console.error(e); }
    }

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

        if (!routines.length && !todos.length) {
          setProgressPercent(log.fulfillment ?? 0);
        }
      }
      setDailyLogLoaded(true);
    });
    return () => unsub();
  }, [user, todayStr]);

  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);

  useEffect(() => {
    if (!user) return;
    const qRoutines = query(collection(db, `users/${user.uid}/routines`), where("date", "==", todayStr));
    const unsubRoutines = onSnapshot(qRoutines, async (snap) => {
      let fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RoutineItem));
      if (fetched.length === 0 && isToday(displayDate)) {
        const masterData = await getMasterRoutines(user.uid);
        if (masterData.length > 0) {
          for (const m of masterData) {
            await saveRoutine(user.uid, { text: m.text, date: todayStr, completed: false, achievement: 1 });
          }
        }
      }
      setRoutines(fetched);
    });

    const qTodos = query(collection(db, `users/${user.uid}/todos`), where("date", "==", todayStr));
    const unsubTodos = onSnapshot(qTodos, (snap) => {
      setTodos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TodoItem)));
    });

    return () => { unsubRoutines(); unsubTodos(); };
  }, [user, todayStr, displayDate]);

  const calculatedFulfillment = useMemo(() => {
    const allItems = [...routines, ...todos];
    if (allItems.length === 0) return 0;
    const total = allItems.reduce((acc, item) => acc + (item.achievement || (item.completed ? 5 : 1)), 0);
    const max = allItems.length * 5;
    return Math.round((total / max) * 100);
  }, [routines, todos]);

  useEffect(() => {
    if (!user || !dailyLogLoaded || (routines.length === 0 && todos.length === 0)) return;
    if (calculatedFulfillment !== progressPercent) {
      const syncFulfillment = async () => {
        const docRef = doc(db, `users/${user.uid}/dailyLogs`, todayStr);
        await setDoc(docRef, { fulfillment: calculatedFulfillment, updatedAt: serverTimestamp() }, { merge: true });
        setProgressPercent(calculatedFulfillment);
      };
      syncFulfillment();
    }
  }, [calculatedFulfillment, user, todayStr, dailyLogLoaded]);

  useEffect(() => {
    if (!user) return;
    const qStudy = query(collection(db, `users/${user.uid}/studyLogs`), where("date", "==", todayStr));
    const unsubStudy = onSnapshot(qStudy, (snap) => {
      setTodayStudyMins(snap.docs.reduce((acc, doc) => acc + doc.data().durationMins, 0));
    });
    return () => unsubStudy();
  }, [user, todayStr]);

  useEffect(() => {
    if (!user) return;
    const qReading = query(collection(db, `users/${user.uid}/readingLogs`), where("date", "==", todayStr));
    const unsubReading = onSnapshot(qReading, (snap) => {
      setTodayReadingMins(snap.docs.reduce((acc, doc) => acc + doc.data().durationMins, 0));
    });
    return () => unsubReading();
  }, [user, todayStr]);

  const saveField = async (field: string, value: any) => {
    if (!user) return;
    setIsSavingField(prev => ({ ...prev, [field]: true }));
    try {
      const docRef = doc(db, `users/${user.uid}/dailyLogs`, todayStr);
      const fieldMap: Record<string, string> = {
        schedule: 'schedule', diary: 'diary', fulfillment: 'fulfillment',
        wakeTime: 'wakeTime', bedTime: 'bedTime', dinner: 'dinner', phoneTimeMins: 'phoneTimeMins'
      };
      await setDoc(docRef, { [fieldMap[field] || field]: value, updatedAt: serverTimestamp() }, { merge: true });
      const draft = JSON.parse(localStorage.getItem(getDraftKey()) || "{}");
      delete draft[field];
      if (Object.keys(draft).length === 0) localStorage.removeItem(getDraftKey());
      else localStorage.setItem(getDraftKey(), JSON.stringify(draft));
      setIsDirty(prev => ({ ...prev, [field]: false }));
    } catch (e) { console.error(e); } finally { setIsSavingField(prev => ({ ...prev, [field]: false })); }
  };

  const handleFieldChange = (field: string, value: any, setter: Function) => {
    setter(value);
    setIsDirty(prev => ({ ...prev, [field]: true }));
    const draft = JSON.parse(localStorage.getItem(getDraftKey()) || "{}");
    draft[field] = value;
    localStorage.setItem(getDraftKey(), JSON.stringify(draft));
  };

  const [showRoutineInput, setShowRoutineInput] = useState(false);
  const [newRoutineText, setNewRoutineText] = useState("");
  const [showTodoInput, setShowTodoInput] = useState(false);
  const [newTodoText, setNewTodoText] = useState("");

  const handleUpdateRoutine = async (routine: RoutineItem, updates: Partial<RoutineItem>) => {
    if (!user) return;
    const updated = { ...routine, ...updates };
    setRoutines(prev => prev.map(r => r.id === routine.id ? updated : r));
    await saveRoutine(user.uid, { text: updated.text, date: updated.date, completed: (updated.achievement || 0) >= 5, achievement: updated.achievement, comment: updated.comment }, routine.id);
  };

  const handleUpdateTodo = async (todo: TodoItem, updates: Partial<TodoItem>) => {
    if (!user) return;
    const updated = { ...todo, ...updates };
    setTodos(prev => prev.map(t => t.id === todo.id ? updated : t));
    await saveTodo(user.uid, { text: updated.text, date: updated.date, completed: (updated.achievement || 0) >= 5, achievement: updated.achievement, comment: updated.comment }, todo.id);
  };

  const sleepInfo = useMemo(() => {
    const [startH, startM] = bedTime.split(":").map(Number);
    const [endH, endM] = wakeTime.split(":").map(Number);
    let mins = (endH * 60 + endM) - (startH * 60 + startM);
    if (mins < 0) mins += 1440;
    const h = Math.floor(mins / 60); const m = mins % 60;
    let hue = 120; if (mins < 450) hue = Math.max(0, 120 - ((450 - mins) * 1.5));
    return { text: `${h}h ${m}m`, color: `hsl(${hue}, 70%, 45%)` };
  }, [wakeTime, bedTime]);

  // UI Utilities
  const cardStyle = "bg-white p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all animate-in fade-in duration-500 overflow-hidden";
  const labelStyle = "text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1 block opacity-60";
  const getAchievementColor = (level: number) => {
    if (level === 5) return "bg-red-500";
    if (level === 4) return "bg-orange-500";
    if (level === 3) return "bg-yellow-500";
    if (level === 2) return "bg-teal-400";
    if (level === 1) return "bg-blue-500";
    return "bg-muted";
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-7 pb-36 bg-[#fcfcfd] min-h-screen">
      <header className="flex flex-col gap-2 pt-2">
        <div className="flex items-end justify-between">
          <div className="space-y-0.5">
             <h1 className="text-3xl font-black text-foreground tracking-tight">{dict.daily.title}</h1>
             <p className="text-sm text-balance text-muted-foreground font-bold">{format(displayDate, "MMMM dd (E)")}</p>
          </div>
          <Link href="/calendar" className="p-2.5 bg-white shadow-sm rounded-2xl hover:scale-105 transition-all text-primary border border-gray-50">
             <CalendarDays size={22} />
          </Link>
        </div>
      </header>

      {/* 1. Schedule */}
      <section className={cardStyle}>
        <div className="flex items-center justify-between mb-4">
           <h2 className="font-black text-lg flex items-center gap-2"><CalendarClock className="text-primary" size={20}/> {dict.daily.todaySchedule}</h2>
           {isDirty.schedule && <button onClick={() => saveField('schedule', schedule)} className="bg-primary text-white text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-wider shadow-md hover:brightness-110">Save</button>}
        </div>
        <textarea 
          value={schedule} onChange={e => handleFieldChange('schedule', e.target.value, setSchedule)} 
          placeholder={dict.daily.todaySchedulePlaceholder} 
          className="w-full h-20 bg-transparent text-sm font-medium resize-none outline-none text-foreground/80 placeholder:text-muted-foreground/30"
        />
      </section>

      {/* 2. Today's Dashboard (UNIFIED STATS) */}
      <section className={`${cardStyle} !p-6`}>
         <div className="flex items-center justify-between mb-5">
            <h2 className="font-black text-lg flex items-center gap-2"><Target className="text-primary" size={20}/> 今日のデータ</h2>
            <div className="text-[10px] bg-primary/5 text-primary py-1 px-3 rounded-full font-black">ACTIVE</div>
         </div>
         <div className="grid grid-cols-2 gap-4">
            <Link href="/study" className="p-4 bg-slate-50/50 rounded-2xl flex flex-col gap-1.5 group hover:bg-slate-100 transition-colors">
               <span className={labelStyle}>Study</span>
               <div className="flex items-baseline gap-0.5 font-black text-2xl text-slate-800">
                  {Math.floor((todayStudyMins || 0) / 60)}<span className="text-[10px] mr-1">h</span>
                  {(todayStudyMins || 0) % 60}<span className="text-[10px]">m</span>
               </div>
            </Link>
            <Link href="/reading" className="p-4 bg-blue-50/50 rounded-2xl flex flex-col gap-1.5 group hover:bg-blue-100 transition-colors">
               <span className={labelStyle}>Reading</span>
               <div className="flex items-baseline gap-0.5 font-black text-2xl text-blue-900/80">
                  {Math.floor((todayReadingMins || 0) / 60)}<span className="text-[10px] mr-1">h</span>
                  {(todayReadingMins || 0) % 60}<span className="text-[10px]">m</span>
               </div>
            </Link>
            <div 
              className="p-4 bg-indigo-50/50 rounded-2xl flex flex-col gap-1.5 cursor-pointer"
              onClick={() => setIsSleepExpanded(!isSleepExpanded)}
            >
               <span className={labelStyle}>Sleep</span>
               <div className="flex items-baseline gap-0.5 font-black text-2xl text-indigo-900/80">
                  {sleepInfo.text.split(' ')[0]}<span className="text-[10px] mr-1">h</span>
                  {sleepInfo.text.split(' ')[1].replace('m', '')}<span className="text-[10px]">m</span>
               </div>
            </div>
            <div className="p-4 bg-teal-50/50 rounded-2xl flex flex-col gap-1.5">
               <span className={labelStyle}>Phone</span>
               <div className="flex items-baseline gap-0.5 font-black text-2xl text-teal-900/80">
                  {Math.floor(phoneTimeMins / 60)}<span className="text-[10px] mr-1">h</span>
                  {phoneTimeMins % 60}<span className="text-[10px]">m</span>
               </div>
            </div>
         </div>
         {isSleepExpanded && (
           <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
              <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400">Wake Up</label>
                 <input type="time" value={wakeTime} onChange={e => handleFieldChange("wakeTime", e.target.value, setWakeTime)} onBlur={() => saveField("wakeTime", wakeTime)} className="w-full bg-white p-2 rounded-xl text-sm font-black border border-slate-100 outline-none" />
              </div>
              <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400">Bedtime</label>
                 <input type="time" value={bedTime} onChange={e => handleFieldChange("bedTime", e.target.value, setBedTime)} onBlur={() => saveField("bedTime", bedTime)} className="w-full bg-white p-2 rounded-xl text-sm font-black border border-slate-100 outline-none" />
              </div>
           </div>
         )}
      </section>

      {/* 3. Routines */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
           <h2 className="font-black text-xl tracking-tight">Routines</h2>
           <Link href="/settings/routines" className="text-[10px] font-black bg-white rounded-full px-4 py-2 border border-gray-100 shadow-sm text-primary uppercase">Manage</Link>
        </div>
        <div className="space-y-3">
          {routines.map((routine) => {
            const currentLevel = routine.achievement || (routine.completed ? 5 : 1);
            const isExpanded = expandedRoutineId === routine.id;
            return (
              <div key={routine.id} className={`${cardStyle} !p-0 ${isExpanded ? "ring-2 ring-primary/20" : ""}`}>
                <div 
                  className="p-5 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedRoutineId(isExpanded ? null : routine.id)}
                >
                  <span className="font-bold text-base text-slate-800">{routine.text}</span>
                  {!isExpanded && <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg ${getAchievementColor(currentLevel)} transition-all`}>{currentLevel}</div>}
                </div>
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 animate-in slide-in-from-top-2">
                    <div className="flex gap-2 mb-5">
                      {[1,2,3,4,5].map(lv => (
                        <button key={lv} onClick={() => { handleUpdateRoutine(routine, { achievement: lv }); setExpandedRoutineId(null); }} className={`flex-1 h-10 rounded-2xl text-xs font-black border-2 transition-all ${currentLevel === lv ? "text-white shadow-lg "+getAchievementColor(lv)+" border-transparent" : "bg-white border-slate-50 text-slate-300"}`}>{lv}</button>
                      ))}
                    </div>
                    <input type="text" value={routine.comment || ""} onChange={e => handleUpdateRoutine(routine, { comment: e.target.value })} placeholder="Reflection note..." className="w-full bg-slate-50 p-3 rounded-2xl text-xs outline-none font-bold text-slate-600 italic" />
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={() => setShowRoutineInput(true)} className="w-full py-4 rounded-3xl border-2 border-dashed border-slate-200 text-sm font-black text-slate-400 hover:bg-primary/5 hover:border-primary/20 transition-all">+ Add Routine</button>
        </div>
      </section>

      {/* 4. Todo */}
      <section className="space-y-4">
        <h2 className="font-black text-xl px-2 tracking-tight">Focus Tasks</h2>
        <div className="space-y-3">
          {todos.map((todo) => {
            const currentLevel = todo.achievement || (todo.completed ? 5 : 1);
            const isExpanded = expandedTodoId === todo.id;
            return (
              <div key={todo.id} className={`${cardStyle} !p-0 ${isExpanded ? "ring-2 ring-blue-200" : ""}`}>
                <div 
                  className="p-5 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedTodoId(isExpanded ? null : todo.id)}
                >
                  <span className="font-bold text-base text-slate-800">{todo.text}</span>
                  {!isExpanded && <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg ${getAchievementColor(currentLevel)}`}>{currentLevel}</div>}
                </div>
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2">
                    <div className="flex gap-2 mb-4">
                      {[1,2,3,4,5].map(lv => (
                        <button key={lv} onClick={() => { handleUpdateTodo(todo, { achievement: lv }); setExpandedTodoId(null); }} className={`flex-1 h-10 rounded-2xl text-xs font-black border-2 transition-all ${currentLevel === lv ? "text-white "+getAchievementColor(lv)+" border-transparent shadow-lg" : "bg-white border-slate-50 text-slate-300"}`}>{lv}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={() => setShowTodoInput(true)} className="w-full py-4 rounded-3xl border-2 border-dashed border-slate-200 text-sm font-black text-slate-400 transition-all">+ Add Task</button>
        </div>
      </section>

      {/* 5. Night Reflection */}
      <section className="space-y-4">
         <div className="flex items-center justify-between px-2">
            <h2 className="font-black text-xl tracking-tight">Night Reflection</h2>
            {(isDirty.diary || isDirty.dinner) && <button onClick={async () => { if (isDirty.diary) await saveField('diary', diary); if (isDirty.dinner) await saveField('dinner', dinner); }} className="bg-primary text-white text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-wider">Finish</button>}
         </div>
         <div className={cardStyle}>
            <div className="mb-4">
               <span className={labelStyle}>Dinner</span>
               <input type="text" value={dinner} onChange={e => handleFieldChange('dinner', e.target.value, setDinner)} placeholder="..." className="w-full bg-slate-50 p-4 rounded-2xl text-sm font-bold outline-none" />
            </div>
            <div>
               <span className={labelStyle}>Reflection Diary</span>
               <textarea value={diary} onChange={e => handleFieldChange('diary', e.target.value, setDiary)} className="w-full h-32 bg-slate-50 p-4 rounded-2xl text-sm font-medium resize-none outline-none text-slate-700" />
            </div>
         </div>
      </section>

      {/* 6. Fulfillment Summary (PREMIUM FOOTER) */}
      <section className="bg-[#1a1a1e] p-8 rounded-[40px] shadow-2xl space-y-6 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
           <TrendingUp size={120} className="text-white" />
        </div>
        <div className="flex items-center justify-between relative z-10">
          <div className="space-y-1">
            <h2 className="font-black text-3xl text-white tracking-tighter">{dict.daily.fulfillment}</h2>
            <p className="text-[10px] text-primary font-black uppercase tracking-[0.2em] opacity-80">Daily Progress Analytics</p>
          </div>
          <div 
            className="w-20 h-20 rounded-3xl flex items-center justify-center text-white font-black text-3xl shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-all transform group-hover:scale-105" 
            style={{ backgroundColor: `hsl(${220 - (progressPercent * 2.2)}, 80%, 55%)` }}
          >
            {progressPercent}%
          </div>
        </div>
        <div className="relative h-3 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
          <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%`, backgroundColor: `hsl(${220 - (progressPercent * 2.2)}, 80%, 55%)` }} />
        </div>
        <div className="flex justify-between items-center text-white/40 font-black text-[9px] uppercase tracking-widest relative z-10">
           <span>Total Achievement Score</span>
           <span>Level: {progressPercent < 40 ? "Novice" : progressPercent < 80 ? "Pro" : "Godlike"}</span>
        </div>
      </section>

      {/* Routine/Todo Modals */}
      {showRoutineInput && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-6">
           <div className={cardStyle + " w-full max-w-sm pt-8"}>
              <h2 className="text-xl font-black mb-6">New Routine</h2>
              <input type="text" value={newRoutineText} onChange={e => setNewRoutineText(e.target.value)} placeholder="Action name..." className="w-full bg-slate-50 p-4 rounded-2xl mb-6 outline-none font-bold" autoFocus />
              <div className="flex gap-3">
                 <button onClick={() => setShowRoutineInput(false)} className="flex-1 py-4 font-black text-slate-400">Cancel</button>
                 <button onClick={async () => { if (!user || !newRoutineText.trim()) return; await saveRoutine(user.uid, { text: newRoutineText.trim(), date: todayStr, completed: false, achievement: 1 }); setNewRoutineText(""); setShowRoutineInput(false); }} className="flex-1 py-4 bg-primary text-white rounded-2xl font-black shadow-lg">Create</button>
              </div>
           </div>
        </div>
      )}
      {showTodoInput && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-6">
           <div className={cardStyle + " w-full max-w-sm pt-8"}>
              <h2 className="text-xl font-black mb-6">Focus Task</h2>
              <input type="text" value={newTodoText} onChange={e => setNewTodoText(e.target.value)} placeholder="What needs to be done?" className="w-full bg-slate-50 p-4 rounded-2xl mb-6 outline-none font-bold" autoFocus />
              <div className="flex gap-3">
                 <button onClick={() => setShowTodoInput(false)} className="flex-1 py-4 font-black text-slate-400">Cancel</button>
                 <button onClick={async () => { if (!user || !newTodoText.trim()) return; await saveTodo(user.uid, { text: newTodoText.trim(), date: todayStr, completed: false, achievement: 1 }); setNewTodoText(""); setShowTodoInput(false); }} className="flex-1 py-4 bg-primary text-white rounded-2xl font-black shadow-lg">Save Task</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
