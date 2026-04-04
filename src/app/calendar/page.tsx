"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { collection, query, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Goal } from "@/lib/firebase/db";
import { CalendarDays, Target, Flag, Mountain, Plus } from "lucide-react";
import { ja, enUS } from "date-fns/locale";

export default function CalendarPage() {
  const { dict, language } = useLanguage();
  const router = useRouter();
  const [selected, setSelected] = useState<Date>();
  
  // 今カレンダーで見ている月 (Month changeに対応するため)
  const [viewMonth, setViewMonth] = useState<Date>(new Date());

  // 目標データの取得
  const [goals, setGoals] = useState<Goal[]>([]);
  // 充実度データの取得
  const [dailyLogs, setDailyLogs] = useState<Record<string, number>>({});
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `users/${user.uid}/goals`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Goal));
      setGoals(fetched);
    });
    return () => unsubscribe();
  }, [user]);

  // 表示中の月の充実度を取得
  useEffect(() => {
    if (!user) return;
    // その月の全データを取得（簡易的に全件取得でも良いが、量が増えるとクエリ制限が必要）
    // ここでは現在見ている月の前後を含めて取得
    const q = query(collection(db, `users/${user.uid}/dailyLogs`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: Record<string, number> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.fulfillment !== undefined) {
          logs[doc.id] = data.fulfillment;
        }
      });
      setDailyLogs(logs);
    });
    return () => unsubscribe();
  }, [user]);

  const handleDaySelect = (day: Date | undefined) => {
    if (day) {
      const dateStr = format(day, 'yyyy-MM-dd');
      setSelected(day);
      // navigationを確実にするため、少し遅延させるか、window.locationを使うことも検討
      // 今回はrouter.pushの後に確実に反映されるよう、パスを構築
      router.push(`/?date=${dateStr}`);
    }
  };

  const handleMonthChange = (month: Date) => {
    setViewMonth(month);
  };

  // 表示中の月に該当する目標をフィルタリング
  const viewYear = viewMonth.getFullYear();
  const viewMonthIdx = viewMonth.getMonth(); // 0-11

  // 今年の目標
  const yearGoals = goals.filter(g => g.type === 'year');
  const monthGoals = goals.filter(g => {
    if (g.type !== 'month') return false;
    const gDate = parseISO(g.date);
    return gDate.getFullYear() === viewYear && gDate.getMonth() === viewMonthIdx;
  });
  // 長期ターゲット
  const longTermGoals = goals.filter(g => g.type === 'longterm');

  const CustomDayButton = (props: { day: { date: Date }, modifiers: Record<string, boolean>, className?: string }) => {
    const { day, className, ...buttonProps } = props;
    const date = day.date;
    const dateStr = format(date, 'yyyy-MM-dd');
    const fulfillment = dailyLogs[dateStr];
    
    return (
      <button 
        {...buttonProps} 
        className={`${className || ''} flex flex-col items-center justify-center p-1 w-full h-full relative focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all hover:bg-primary/5 rounded-lg`}
      >
        <span className="text-sm font-bold">{date.getDate()}</span>
        {fulfillment !== undefined && (
          <span className="text-[10px] font-black mt-0.5 leading-none transition-all pulse" style={{ color: `hsl(${220 - (fulfillment * 2.2)}, 80%, 50%)` }}>
            {fulfillment}
          </span>
        )}
      </button>
    );
  };

  const isCurrentMonth = viewMonth.getMonth() === new Date().getMonth() && viewMonth.getFullYear() === new Date().getFullYear();

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-24 mt-4">
      <header className="text-center">
        <div className="inline-flex items-center justify-center p-3 bg-primary/10 text-primary rounded-full mb-4">
           <CalendarDays size={32} />
        </div>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">{dict.common.calendar}</h1>
        <p className="text-sm text-muted-foreground mt-2 font-medium">
          日付をタップして確認・入力へ
        </p>
      </header>

      {/* Calendar Section */}
      <section className="bg-white p-5 rounded-2xl shadow-sm border border-border flex flex-col items-center">
        <style>{`
          .rdp { --rdp-accent-color: var(--primary); --rdp-background-color: var(--muted); margin: 0; }
          .rdp-cell {
            padding: 0.5rem 0.25rem;
          }
          .rdp-day { 
            position: relative; 
            height: 3.5rem;
            width: 3.5rem;
          }
          .rdp-day_button {
            width: 100%;
            height: 100%;
            border-radius: 0.5rem;
          }
          .rdp-caption_dropdowns {
            gap: 0.5rem;
          }
          .rdp-caption {
            margin-bottom: 1.5rem;
          }
        `}</style>
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={handleDaySelect}
          month={viewMonth}
          onMonthChange={handleMonthChange}
          className="bg-white rounded-xl mx-auto"
          locale={ja}
          captionLayout="dropdown"
          fromYear={2020}
          toYear={2030}
          components={{
            DayButton: CustomDayButton
          } as React.ComponentProps<typeof DayPicker>["components"]}
        />
        <div className="mt-8 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-4 py-2 rounded-full">
           日付の下の数字はその日の「充実度」を表します。
        </div>
      </section>

      {/* Dynamic Archives Section */}
      <section className="bg-white p-5 rounded-2xl shadow-sm border border-border animate-in slide-in-from-bottom-4 duration-500">
        <h2 className="font-semibold text-lg flex items-center gap-2 mb-4">
          <CalendarDays className="text-primary" size={20}/> 
          {format(viewMonth, 'yyyy年M月')} の目標・記録
        </h2>
        
        <div className="space-y-4">
          {yearGoals.length === 0 && monthGoals.length === 0 && longTermGoals.length === 0 ? (
            <div className="text-center p-8 border border-dashed rounded-2xl border-border bg-muted/5">
              <p className="text-sm text-muted-foreground font-medium mb-3">
                目標が設定されていません
              </p>
              <Link href="/goals" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-full text-xs font-bold hover:bg-primary/90 transition-all shadow-sm">
                 <Plus size={14} /> 目標を設定する
              </Link>
            </div>
          ) : (
            <>
              {/* Year Goals */}
              {yearGoals.map(g => (
                <div key={g.id} className="p-4 rounded-xl border border-border shadow-sm flex items-start gap-3 bg-primary/5">
                  <Target className="text-primary mt-0.5" size={18}/>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground font-semibold mb-1">{viewYear}年の目標</p>
                    <p className={`font-bold text-base text-foreground leading-tight ${g.isCompleted ? 'line-through opacity-70' : ''}`}>
                      {g.title}
                    </p>
                  </div>
                </div>
              ))}

              {/* Month Goals */}
              {monthGoals.map(g => (
                <div key={g.id} className="p-4 rounded-xl border border-border shadow-sm flex items-start gap-3">
                  <Flag className="text-amber-500 mt-0.5" size={18}/>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground font-semibold mb-1">{viewMonthIdx + 1}月の目標</p>
                    <p className={`font-bold text-base text-foreground leading-tight ${g.isCompleted ? 'line-through opacity-70' : ''}`}>
                      {g.title}
                    </p>
                  </div>
                </div>
              ))}

              {/* Long Term */}
              {longTermGoals.map(g => (
                <div key={g.id} className="p-4 rounded-xl border border-border shadow-sm flex items-start gap-3">
                  <Mountain className="text-purple-500 mt-0.5" size={18}/>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground font-semibold mb-1">長期目標</p>
                    <p className={`font-bold text-base text-foreground leading-tight ${g.isCompleted ? 'line-through opacity-70' : ''}`}>
                      {g.title}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        
      </section>

    </div>
  );
}
