"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Target, 
  Plus, 
  CheckCircle2, 
  Edit2, 
  Trash2, 
  Flag, 
  Mountain, 
  ChevronDown, 
  ChevronRight, 
  CalendarDays, 
  X,
  PlusCircle,
  Loader2
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { 
  saveGoal, 
  deleteGoal, 
  toggleGoalCompletion,
  Goal 
} from "@/lib/firebase/db";

export default function GoalsPage() {
  const { dict } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  // モーダル・入力状態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editGoalId, setEditGoalId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<'year' | 'month' | 'longterm'>('month');

  // リアルタイム取得
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, `users/${user.uid}/goals`),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Goal));
      setGoals(fetched);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const handleSave = async () => {
    if (!user || !newTitle.trim()) return;
    try {
      const gData = {
        title: newTitle.trim(),
        type: newType,
        date: format(new Date(), "yyyy-MM-dd"), // 簡易的に今日の日付を基準にする
        isCompleted: false
      };
      await saveGoal(user.uid, gData, editGoalId || undefined);
      setIsModalOpen(false);
      setNewTitle("");
      setEditGoalId(null);
    } catch (err) {
      console.error(err);
      alert("エラーが発生しました。");
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || !window.confirm("この目標を削除しますか？")) return;
    try {
      await deleteGoal(user.uid, id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggle = async (goal: Goal) => {
    if (!user) return;
    try {
      await toggleGoalCompletion(user.uid, goal.id, !goal.isCompleted);
    } catch (err) {
      console.error(err);
    }
  };

  const openAddModal = (type: 'year' | 'month' | 'longterm') => {
    setNewType(type);
    setEditGoalId(null);
    setNewTitle("");
    setIsModalOpen(true);
  };

  const openEditModal = (goal: Goal) => {
    setNewType(goal.type);
    setEditGoalId(goal.id);
    setNewTitle(goal.title);
    setIsModalOpen(true);
  };

  const GoalCard = ({ goal }: { goal: Goal }) => {
    const Icon = goal.type === 'year' ? Target : goal.type === 'month' ? Flag : Mountain;
    return (
      <div className={`p-4 rounded-xl flex flex-col gap-2 relative group transition-all border ${goal.isCompleted ? 'bg-white shadow-sm border-border opacity-75' : 'bg-primary/5 border-primary/20 hover:shadow-md'}`}>
        <div className="flex items-start gap-3">
          <button onClick={() => handleToggle(goal)} className="shrink-0 mt-0.5 transition-transform active:scale-95">
            {goal.isCompleted ? <CheckCircle2 className="text-green-500" size={20} /> : <div className="w-5 h-5 border-2 border-primary/30 rounded-full" />}
          </button>
          <div className="flex-1 pr-10">
            <p className={`font-bold text-lg leading-tight transition-all ${goal.isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {goal.title}
            </p>
          </div>
        </div>
        <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => openEditModal(goal)} className="text-muted-foreground hover:text-primary p-1"><Edit2 size={14} /></button>
          <button onClick={() => handleDelete(goal.id)} className="text-muted-foreground hover:text-red-500 p-1"><Trash2 size={14} /></button>
        </div>
      </div>
    );
  };

  const CollapsibleSection = ({ title, type, icon: Icon, defaultOpen = true }: { title: string, type: 'year' | 'month' | 'longterm', icon: any, defaultOpen?: boolean }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const filterGoals = goals.filter(g => g.type === type);
    
    return (
      <section className="space-y-3 bg-white p-5 rounded-2xl shadow-sm border border-border">
        <div className="flex items-center justify-between">
          <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 text-left focus:outline-none hover:opacity-80 transition-opacity">
            <h2 className="font-semibold text-xl flex items-center gap-2 tracking-tight">
              <Icon className="text-primary" size={22}/> {title}
            </h2>
            <div className="text-muted-foreground">
              {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </div>
          </button>
          <button onClick={() => openAddModal(type)} className="text-primary hover:bg-primary/10 p-1.5 rounded-full transition-colors">
            <Plus size={20} />
          </button>
        </div>
        {isOpen && (
          <div className="grid gap-3 pt-3 border-t border-border mt-3 animate-in fade-in duration-300">
            {filterGoals.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{dict.goals.addGoal}からはじめましょう</p>
            ) : (
              filterGoals.map(g => <GoalCard key={g.id} goal={g} />)
            )}
            <button 
              onClick={() => openAddModal(type)}
              className="flex items-center justify-center gap-2 p-3.5 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:bg-muted/50 hover:text-primary hover:border-primary/50 transition-all font-medium text-sm"
            >
              <Plus size={18} /> {dict.goals.addGoal}
            </button>
          </div>
        )}
      </section>
    );
  };

  if (loading && user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500 pb-24">
      <header className="mb-4">
        <div className="flex items-end gap-3 mt-1 mb-4 flex-wrap">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">{dict.goals.title}</h1>
        </div>
        <Link href="/calendar" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-border rounded-full text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/50 shadow-sm transition-all group">
          <CalendarDays size={14} className="text-primary/70 group-hover:text-primary transition-colors" /> カレンダーを表示
        </Link>
      </header>

      <CollapsibleSection title="今年の目標" type="year" icon={Target} />
      <CollapsibleSection title="今月の目標" type="month" icon={Flag} />
      <CollapsibleSection title="長期ターゲット" type="longterm" icon={Mountain} />

      {/* 目標追加モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <PlusCircle className="text-primary" size={22} />
                {editGoalId ? "目標を編集" : "目標を追加"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 rounded-full hover:bg-muted transition-colors"><X size={20} /></button>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">目標の内容</label>
                <textarea 
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full border border-border rounded-2xl p-4 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all min-h-[100px]"
                  placeholder="何を実現しますか？"
                  autoFocus
                />
              </div>
              
              <div className="pt-2">
                <button 
                  onClick={handleSave}
                  disabled={!newTitle.trim()}
                  className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                >
                  {editGoalId ? "変更を保存" : "目標を刻む"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
