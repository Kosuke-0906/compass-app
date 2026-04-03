"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Trash2, GripVertical, Save } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { MasterRoutine, getMasterRoutines, saveMasterRoutine, deleteMasterRoutine } from "@/lib/firebase/db";

export default function RoutineSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { dict } = useLanguage();
  const [routines, setRoutines] = useState<MasterRoutine[]>([]);
  const [newRoutineText, setNewRoutineText] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchRoutines = async () => {
      const data = await getMasterRoutines(user.uid);
      setRoutines(data);
      setLoading(false);
    };
    fetchRoutines();
  }, [user]);

  const handleAddRoutine = async () => {
    if (!user || !newRoutineText.trim()) return;
    const newRoutine: Omit<MasterRoutine, 'id'> = {
      text: newRoutineText.trim(),
      order: routines.length
    };
    const id = await saveMasterRoutine(user.uid, newRoutine);
    setRoutines([...routines, { id, ...newRoutine }]);
    setNewRoutineText("");
  };

  const handleDeleteRoutine = async (id: string) => {
    if (!user) return;
    await deleteMasterRoutine(user.uid, id);
    setRoutines(routines.filter(r => r.id !== id));
  };

  if (loading) return <div className="p-10 text-center animate-pulse">Loading...</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500 pb-24">
      <header className="flex items-center gap-4">
        <button 
          onClick={() => router.back()}
          className="p-2 hover:bg-muted rounded-full transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold">{dict.daily.routine}の既定設定</h1>
      </header>

      <div className="bg-white rounded-2xl border border-border shadow-sm p-6 space-y-6">
        <p className="text-sm text-muted-foreground leading-relaxed">
          ここで設定したルーティンは、新しい日のページを最初に開いたときに自動的に表示されます。
          <br />
          <span className="text-xs font-bold text-amber-600">※過去の日のルーティンは変更されません。</span>
        </p>

        <div className="space-y-3">
          {routines.map((routine) => (
            <div key={routine.id} className="flex items-center gap-3 p-4 bg-muted/20 border border-border rounded-xl">
              <GripVertical size={18} className="text-muted-foreground/40 cursor-grab" />
              <span className="flex-1 font-medium">{routine.text}</span>
              <button 
                onClick={() => handleDeleteRoutine(routine.id)}
                className="text-muted-foreground hover:text-red-500 transition-colors p-1"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-4 border-t border-border">
          <input
            type="text"
            value={newRoutineText}
            onChange={(e) => setNewRoutineText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddRoutine()}
            placeholder="新しいルーティン..."
            className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button 
            onClick={handleAddRoutine}
            className="bg-primary text-white px-6 rounded-xl font-bold text-sm hover:brightness-110 transition-all flex items-center gap-2"
          >
            <Plus size={18} />
            追加
          </button>
        </div>
      </div>
      
      <button 
        onClick={() => router.back()}
        className="w-full py-4 bg-white border border-border rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-muted transition-all"
      >
        <Save size={18} className="text-primary" />
        設定を完了して戻る
      </button>
    </div>
  );
}
