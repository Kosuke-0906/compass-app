"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { useLanguage } from "@/context/LanguageContext";
import { CalendarDays, Target, Flag, Mountain, Plus } from "lucide-react";
import { ja, enUS } from "date-fns/locale";

export default function CalendarPage() {
  const { dict, language } = useLanguage();
  const router = useRouter();
  const [selected, setSelected] = useState<Date>();
  
  // 今カレンダーで見ている月 (Month changeに対応するため)
  const [viewMonth, setViewMonth] = useState<Date>(new Date());

  const handleDaySelect = (day: Date | undefined) => {
    if (day) {
      setSelected(day);
      router.push(`/?date=${format(day, 'yyyy-MM-dd')}`);
    }
  };

  const handleMonthChange = (month: Date) => {
    setViewMonth(month);
  };

  const mockTargets: any[] = [];

  const CustomDayButton = (props: any) => {
    const { day, modifiers, className, ...buttonProps } = props;
    const date = day.date;
    const isFuture = date > new Date();
    const mockFulfillment = null; 
    
    // Targetの期日と合致する日だけ強調する
    const target = mockTargets.find(t => 
      t.date.getFullYear() === date.getFullYear() && 
      t.date.getMonth() === date.getMonth() && 
      t.date.getDate() === date.getDate()
    );

    let fulfillmentColorClass = "text-muted-foreground";
    if (mockFulfillment) {
      if (mockFulfillment >= 80) fulfillmentColorClass = "text-red-500 font-bold";
      else if (mockFulfillment >= 50) fulfillmentColorClass = "text-amber-500 font-semibold";
      else fulfillmentColorClass = "text-blue-500";
    }

    const dateNumberClass = target ? `font-extrabold ${target.color} text-lg` : "text-sm font-medium";

    return (
      <button 
        {...buttonProps} 
        className={`${className || ''} flex flex-col items-center justify-center p-1 w-full h-full relative focus:outline-none focus:ring-2 focus:ring-primary/50`}
      >
        <span className={dateNumberClass}>{date.getDate()}</span>
        {mockFulfillment !== null && (
          <span className={`text-[10px] mt-0.5 leading-none ${fulfillmentColorClass}`}>
            {mockFulfillment}%
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
          {language === 'ja' ? '日付をタップして確認・入力へ' : 'Tap a date to view or edit records'}
        </p>
      </header>

      {/* Calendar Section */}
      <section className="bg-white p-5 rounded-2xl shadow-sm border border-border flex flex-col items-center">
        <style>{`
          .rdp { --rdp-accent-color: var(--primary); --rdp-background-color: var(--muted); margin: 0; }
          .rdp-cell {
            padding: 0.5rem 0.25rem; /* セル間に縦の余白を追加して全体的に広くする */
          }
          .rdp-day { 
            position: relative; 
            height: 3.5rem; /* セル自体も縦長にする */
            width: 3.5rem;
          }
          .rdp-day_button {
            width: 100%;
            height: 100%;
            border-radius: 0.5rem;
          }
          .rdp-caption_dropdowns {
            gap: 0.5rem; /* 年と月のドロップダウン間の余白 */
          }
          .rdp-caption {
            margin-bottom: 1.5rem; /* カレンダーヘッダー(年月)と曜日の間の余白を追加 */
          }
        `}</style>
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={handleDaySelect}
          month={viewMonth}
          onMonthChange={handleMonthChange}
          className="bg-white rounded-xl mx-auto"
          locale={language === 'ja' ? ja : enUS}
          captionLayout="dropdown"
          fromYear={2020}
          toYear={2030}
          components={{
            DayButton: CustomDayButton
          } as any}
        />
        <div className="mt-8 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-4 py-2 rounded-full">
           {language === 'ja' ? '日付の下の数字はその日の「充実度」を表します。' : 'Numbers below dates show daily fulfillment.'}
        </div>
      </section>

      {/* Dynamic Archives Section (Shown for past/specific months) */}
      <section className="bg-white p-5 rounded-2xl shadow-sm border border-border animate-in slide-in-from-bottom-4 duration-500">
        <h2 className="font-semibold text-lg flex items-center gap-2 mb-4">
          <CalendarDays className="text-primary" size={20}/> 
          {language === 'ja' ? `${format(viewMonth, 'yyyy年M月')} の目標・記録` : `${format(viewMonth, 'MMMM yyyy')} Records & Goals`}
        </h2>
        
        <div className="space-y-4">
          <div className="text-center p-8 border border-dashed rounded-2xl border-border bg-muted/5">
            <p className="text-sm text-muted-foreground font-medium mb-3">
              {language === 'ja' ? '目標が設定されていません' : 'No goals set for this period'}
            </p>
            <Link href="/goals" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-full text-xs font-bold hover:bg-primary/90 transition-all shadow-sm">
               <Plus size={14} /> {language === 'ja' ? '目標を設定する' : 'Set a Goal'}
            </Link>
          </div>
        </div>
        
      </section>

    </div>
  );
}
