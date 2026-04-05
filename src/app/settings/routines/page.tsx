"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Trash2, GripVertical, Save } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { collection, query, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { MasterRoutine, saveMasterRoutine, deleteMasterRoutine } from "@/lib/firebase/db";

export default function RoutineSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { dict } = useLanguage();
  const [routines, setRoutines] = useState<MasterRoutine[]>([]);
  const [newRoutineText, setNewRoutineText] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, `users/${user.uid}/masterRoutines`));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MasterRoutine));
      setRoutines(data.sort((a, b) => a.order - b.order));
      setLoading(false);
    });
    
    return () => unsub();
  }, [user]);

  const handleAddRoutine = async () => {
    if (!user || !newRoutineText.trim()) return;
    const newRoutine: Omit<MasterRoutine, 'id'> = {
      text: newRoutineText.trim(),
      order: routines.length
    };
    
    // UIを即座に更新 (Optimistic Update)
    setNewRoutineText("");
    
    // 非同期で保存（onSnapshotが後でリストを同期します）
    await saveMasterRoutine(user.uid, newRoutine);
  };

  const handleDeleteRoutine = async (id: string) => {
    if (!user) return;
    
    // UIを即座に更新
    setRoutines(prev => prev.filter(r => r.id !== id));
    
    // マスターと、今日以降のプロビジョニング済みルーティンを一括削除
    const todayStr = format(new Date(), "yyyy-MM-dd");
    await deleteMasterRoutine(user.uid, id, todayStr);
  };

  if (loading) return <div className="p-10 text-center animate-pulse">Loading...</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8 animate-in fade-in duration-200 pb-24">
      <header className="flex items-center gap-4">
        <button 
          onClick={() => router.back()}
          className="p-2 hover:bg-muted rounded-full transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold">{dict.daily.manageRoutines}</h1>
      </header>

      <div className="bg-white rounded-2xl border border-border shadow-sm p-6 space-y-6">
        <p className="text-sm text-muted-foreground leading-relaxed">
          ここで設定したルーティンは、新しい日のページを最初に開いたときに自動的に表示されます。
          <br />
          <span className="text-xs font-bold text-red-500">※削除した場合は、今日とそれ以降の日のルーティンからも削除されます。</span>
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
