"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "react-day-picker/dist/style.css";
import { useLanguage } from "@/context/LanguageContext";
import { Target, Calendar as CalendarIcon, Plus, CheckCircle2, Edit2, Trash2, Flag, Mountain, ChevronDown, ChevronRight, CalendarDays } from "lucide-react";

export default function GoalsPage() {
  const { dict, language } = useLanguage();
  const router = useRouter();

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  
  const mockDates = [
    new Date(currentYear, currentMonth, 15), 
    new Date(currentYear, currentMonth + 1, 31),
    new Date(currentYear + 1, 3, 1),
  ];

  type TagType = { name: string, color: string };

  const GoalCard = ({ title, deadline, completed, tags, hideDeadline }: { title: string, deadline: Date, completed?: boolean, tags?: TagType[], hideDeadline?: boolean }) => (
    <div className={`p-4 rounded-xl flex flex-col gap-2 relative group transition-all border ${completed ? 'bg-white shadow-sm border-border opacity-75 hover:opacity-100 hover:shadow-md' : 'bg-primary/5 border-primary/20 hover:shadow-md'}`}>
      <div className="flex items-start gap-3">
        {completed ? <CheckCircle2 className="text-green-500 shrink-0 mt-0.5" size={20} /> : <Target className="text-primary shrink-0 mt-0.5" size={20} />}
        <div className="flex-1 pr-6 flex flex-col gap-1.5">
          <p className={`font-bold text-lg leading-tight ${completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{title}</p>
          
          <div className="flex items-center gap-3">
            {!hideDeadline && (
              <p className={`text-xs font-semibold flex items-center gap-1 ${completed ? 'text-muted-foreground' : 'text-primary'}`}>
                {dict.goals.deadline}: {format(deadline, 'yyyy/MM/dd')}
              </p>
            )}
            {tags && tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {tags.map(t => (
                  <span key={t.name} className={`text-[10px] px-1.5 py-0.5 rounded border font-bold tracking-wide uppercase ${completed ? 'opacity-50' : t.color}`}>
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="absolute top-4 right-4 flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button className="text-muted-foreground hover:text-primary transition-colors p-1" title={dict.common.edit}><Edit2 size={16} /></button>
        <button className="text-muted-foreground hover:text-red-500 transition-colors p-1" title={dict.common.delete}><Trash2 size={16} /></button>
      </div>
    </div>
  );

  const CollapsibleSection = ({ title, icon: Icon, defaultOpen = true, children }: { title: string, icon: any, defaultOpen?: boolean, children: React.ReactNode }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
      <section className="space-y-3 bg-white p-5 rounded-2xl shadow-sm border border-border">
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          className="w-full flex items-center justify-between text-left focus:outline-none hover:opacity-80 transition-opacity"
        >
          <h2 className="font-semibold text-xl flex items-center gap-2 tracking-tight">
            <Icon className="text-primary" size={22}/> 
            {title}
          </h2>
          <div className="text-muted-foreground bg-muted p-1 rounded-full">
            {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </div>
        </button>
        {isOpen && (
          <div className="grid gap-3 pt-3 border-t border-border mt-3 animate-in fade-in duration-300">
            {children}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500 pb-24">
      <header className="mb-4">
        <div className="flex items-end gap-3 mt-1 mb-4 flex-wrap">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">{dict.goals.title}</h1>
        </div>
        <Link href="/calendar" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-border rounded-full text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/50 shadow-sm transition-all group">
          <CalendarDays size={14} className="text-primary/70 group-hover:text-primary transition-colors" /> {dict.common.calendar}
        </Link>
      </header>

      {/* This Year's Goals */}
      <CollapsibleSection title={dict.goals.thisYear} icon={Target} defaultOpen={true}>
        <button className="flex items-center justify-center gap-2 p-3.5 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:bg-muted/50 hover:text-primary hover:border-primary/50 transition-all font-medium text-sm">
          <Plus size={18} /> {dict.goals.addGoal}
        </button>
      </CollapsibleSection>

      {/* This Month's Goals */}
      <CollapsibleSection title={dict.goals.thisMonth} icon={Flag} defaultOpen={true}>
        <button className="flex items-center justify-center gap-2 p-3.5 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:bg-muted/50 hover:text-primary hover:border-primary/50 transition-all font-medium text-sm">
          <Plus size={18} /> {dict.goals.addGoal}
        </button>
      </CollapsibleSection>

      {/* Target (Medium/Long term goals) */}
      <CollapsibleSection title={dict.goals.longTerm} icon={Mountain} defaultOpen={false}>
        <button className="flex items-center justify-center gap-2 p-3.5 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:bg-muted/50 hover:text-primary hover:border-primary/50 transition-all font-medium text-sm">
          <Plus size={18} /> {dict.goals.addGoal}
        </button>
      </CollapsibleSection>

    </div>
  );
}
