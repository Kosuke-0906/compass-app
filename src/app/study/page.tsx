"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, BookOpen, Clock, BarChart2, PlusCircle, Bookmark, Loader2, X, Tag, Trash2, Edit2, History } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { format, subDays } from "date-fns";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { 
  saveStudyMaterial, 
  saveStudyLog, 
  updateStudyLog,
  deleteStudyLog,
  StudyMaterial, 
  StudyLog 
} from "@/lib/firebase/db";

// 美しいテーマカラーのパレット
export const PALETTE_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", 
  "#84cc16", "#22c55e", "#10b981", "#14b8a6", 
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", 
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e", 
  "#64748b"
];

export default function StudyPage() {
  const { dict } = useLanguage();
  const { user } = useAuth();
  
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [loading, setLoading] = useState(true);

  // 追加モーダルの状態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newColor, setNewColor] = useState(PALETTE_COLORS[9]); // デフォルトはblue-500

  // 勉強時間追加・編集モーダルの状態
  const [timeModalMaterialId, setTimeModalMaterialId] = useState<string | null>(null);
  const [editLogId, setEditLogId] = useState<string | null>(null); // もし編集中ならLogのIDが入る
  const [addTimeMins, setAddTimeMins] = useState(30); // デフォルト30分
  
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const sevenDaysAgoStr = format(subDays(new Date(), 6), "yyyy-MM-dd");

  // 爆速化: onSnapshotによるリアルタイム監視 (Firebaseキャッシュが即座に返る)
  useEffect(() => {
    if (!user) return;
    
    // 教材のリアルタイム取得
    const qMat = query(collection(db, `users/${user.uid}/studyMaterials`));
    const unsubscribeMat = onSnapshot(qMat, (snapshot) => {
      const fetchedMaterials = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudyMaterial));
      setMaterials(fetchedMaterials);
      setLoading(false); // 教材がロードされたらOKとする
    });

    // 過去7日間のログのリアルタイム取得
    const qLogs = query(
      collection(db, `users/${user.uid}/studyLogs`),
      where("date", ">=", sevenDaysAgoStr),
      where("date", "<=", todayStr)
    );
    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      const fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudyLog));
      setLogs(fetchedLogs);
    });

    return () => {
      unsubscribeMat();
      unsubscribeLogs();
    };
  }, [user, sevenDaysAgoStr, todayStr]);

  // 重複のない「カテゴリーと色」のリストを動的に生成
  const uniqueCategories = useMemo(() => {
    const cats: Record<string, string> = {};
    materials.forEach(m => {
      if (!cats[m.categoryId]) {
        cats[m.categoryId] = m.color;
      }
    });
    return Object.keys(cats).map(name => ({ name, color: cats[name] }));
  }, [materials]);

  // 今日のログをマテリアルごとに集計
  const todayLogsByMaterial = useMemo(() => {
    const todayLogs = logs.filter(l => l.date === todayStr);
    const map: Record<string, number> = {};
    todayLogs.forEach(l => {
      map[l.materialId] = (map[l.materialId] || 0) + l.durationMins;
    });
    return map;
  }, [logs, todayStr]);

  // 今日の合計勉強時間
  const totalTodayMins = Object.values(todayLogsByMaterial).reduce((a, b) => a + b, 0);

  // グラフ用データの整形 (過去7日間・動的カテゴリごとにスタック)
  const chartData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd");
      const dayLogs = logs.filter(l => l.date === d);
      
      const dataPoint: any = { 
        name: format(subDays(new Date(), i), "M/d"),
        date: d
      };
      
      // 各ログの時間をカテゴリごとに合算
      dayLogs.forEach(log => {
        const mat = materials.find(m => m.id === log.materialId);
        if (mat) {
          dataPoint[mat.categoryId] = (dataPoint[mat.categoryId] || 0) + log.durationMins;
        }
      });
      data.push(dataPoint);
    }
    return data;
  }, [logs, materials]);

  // 学習時間の追加または編集
  const handleSaveStudyTime = async () => {
    if (!user || !timeModalMaterialId || addTimeMins <= 0) return;

    try {
      if (editLogId) {
        // [UPDATE] 既存のログを編集
        await updateStudyLog(user.uid, editLogId, addTimeMins);
      } else {
        // [CREATE] 新しいログを追加
        const newLogData = {
          date: todayStr,
          materialId: timeModalMaterialId,
          durationMins: addTimeMins
        };
        await saveStudyLog(user.uid, newLogData);
      }
      
      // onSnapshotによって自動で画面が同期されるため、Stateの手動更新は不要
      // モーダルを閉じる
      setTimeModalMaterialId(null);
      setEditLogId(null);
    } catch (err) {
      console.error(err);
      alert("エラーが発生しました。");
    }
  };

  // ログの削除
  const handleDeleteLog = async (logId: string) => {
    if (!user) return;
    if (!window.confirm("この学習記録を削除してもよろしいですか？")) return;
    try {
      await deleteStudyLog(user.uid, logId);
      // onSnapshotによって自動同期される
    } catch (err) {
      console.error("削除エラー:", err);
      alert("削除に失敗しました。");
    }
  };

  // 教材の保存 (モーダルから呼ばれる)
  const handleSaveMaterial = async () => {
    if (!user || !newTitle.trim() || !newCategory.trim()) return;

    try {
      const newMatData = {
        title: newTitle.trim(),
        categoryId: newCategory.trim(),
        color: newColor, 
      };
      
      const newId = await saveStudyMaterial(user.uid, newMatData);
      setMaterials(prev => [...prev, { id: newId, ...newMatData }]);
      
      // リセットして閉じる
      setNewTitle("");
      setNewCategory("");
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("エラーが発生しました。");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <div className="p-6 max-w-2xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-24">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors">
              <ChevronLeft size={24} />
            </Link>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              <BookOpen className="text-primary" size={26} /> 学習の記録
            </h1>
          </div>
        </header>

        {/* Summary Stat */}
        <section className="bg-gradient-to-br from-primary/10 to-primary/5 p-6 rounded-3xl border border-primary/20 shadow-sm flex flex-col items-center justify-center text-center">
          <h2 className="text-sm font-semibold text-primary/80 mb-2">今日の勉強時間</h2>
          <div className="flex items-baseline gap-2 text-primary">
            <span className="text-5xl font-black tracking-tighter">
              {Math.floor(totalTodayMins / 60)}
            </span>
            <span className="text-xl font-bold">h</span>
            <span className="text-5xl font-black tracking-tighter ml-2">
              {totalTodayMins % 60}
            </span>
            <span className="text-xl font-bold">m</span>
          </div>
        </section>

        {/* Stacked Bar Chart */}
        <section className="bg-white p-5 rounded-2xl shadow-sm border border-border">
          <h2 className="font-semibold text-lg flex items-center gap-2 mb-6">
            <BarChart2 className="text-primary" size={20}/> 
            1週間の推移
          </h2>
          <div className="h-[250px] w-full">
            {logs.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm font-medium">
                まだ記録がありません。
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} dy={10} />
                  <YAxis 
                    tick={{ fontSize: 12, fill: '#6b7280' }} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => {
                      if (value === 0) return "0";
                      const h = Math.floor(value / 60);
                      const m = value % 60;
                      return h > 0 ? (m > 0 ? `${h}h${m}m` : `${h}h`) : `${m}m`;
                    }}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f3f4f6' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any, name: any) => {
                      const h = Math.floor(value / 60);
                      const m = value % 60;
                      const timeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
                      return [timeStr, name];
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                  {/* 自動生成されたカテゴリーからBarを展開 */}
                  {uniqueCategories.map(cat => (
                    <Bar key={cat.name} dataKey={cat.name} stackId="a" fill={cat.color} radius={[0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Materials Input Section */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Bookmark className="text-primary" size={20}/> 
              教材ごとの記録
            </h2>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
            >
              <Plus size={14} /> 新しい教材
            </button>
          </div>
          
          {materials.length === 0 ? (
            <div className="text-center p-8 border border-dashed rounded-xl border-border bg-muted/10">
              <p className="text-sm text-muted-foreground font-medium mb-3">教材が登録されていません</p>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="text-sm font-semibold text-white bg-primary hover:bg-primary/90 px-4 py-2 rounded-full transition-colors inline-block"
              >
                最初の教材を登録する
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {materials.map(material => {
                const minsToday = todayLogsByMaterial[material.id] || 0;
                return (
                  <div key={material.id} className="bg-white border border-border rounded-xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                      <div className="w-1.5 h-10 rounded-full" style={{ backgroundColor: material.color }}></div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wider w-max mb-1 text-white" style={{ backgroundColor: material.color }}>
                          {material.categoryId}
                        </span>
                        <span className="font-semibold text-foreground">{material.title}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right flex flex-col">
                        <span className="text-xs text-muted-foreground font-medium">Today</span>
                        <span className="font-bold text-foreground">
                          {Math.floor(minsToday / 60)}h {minsToday % 60}m
                        </span>
                      </div>
                      <button 
                        onClick={() => {
                          setTimeModalMaterialId(material.id);
                          setAddTimeMins(30);
                        }}
                        className="h-10 w-10 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors flex-shrink-0"
                      >
                        <PlusCircle size={22} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 今日の学習履歴 (編集・削除機能) */}
        <section>
          <div className="flex justify-between items-center mb-4 mt-6">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <History className="text-primary" size={20}/> 
              今日の履歴
            </h2>
          </div>
          <div className="space-y-3">
            {logs.filter(l => l.date === todayStr).length === 0 ? (
              <div className="text-center p-6 border border-dashed rounded-xl border-border bg-white">
                <p className="text-xs text-muted-foreground font-medium">まだ今日の履歴はありません</p>
              </div>
            ) : (
              logs.filter(l => l.date === todayStr).map(log => {
                const mat = materials.find(m => m.id === log.materialId);
                // 教材が削除済みの場合はスキップ
                if (!mat) return null;
                
                return (
                  <div key={log.id} className="bg-white border border-border rounded-xl p-3 flex items-center justify-between shadow-sm group hover:border-primary/30 transition-colors">
                    <div className="flex items-center gap-3">
                      {/* 丸の代わりにスタイリッシュなカラーバー表示に変更 */}
                      <div className="w-1.5 h-10 rounded-full" style={{ backgroundColor: mat.color }}></div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm text-foreground">{mat.title}</span>
                        <span className="text-[10px] uppercase font-bold" style={{ color: mat.color }}>{mat.categoryId}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* 時間を見やすい位置に移動 */}
                      <span className="font-bold text-foreground text-sm mr-2 border border-border px-2 py-1 rounded bg-muted/20">
                        {Math.floor(log.durationMins / 60)}h {log.durationMins % 60}m
                      </span>
                      <div className="flex items-center gap-1.5 lg:opacity-60 lg:group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => {
                            setEditLogId(log.id);
                            setTimeModalMaterialId(mat.id);
                            setAddTimeMins(log.durationMins);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-blue-500 bg-muted/50 hover:bg-blue-50 rounded-md transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteLog(log.id)}
                          className="p-1.5 text-muted-foreground hover:text-red-500 bg-muted/50 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* 新機能: カスタムダイアログ（教材追加） */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-2 duration-300"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Bookmark className="text-primary" size={22}/> 教材の追加
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5">
              {/* 教材名 */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                  <BookOpen size={14} /> 教材・科目の名前
                </label>
                <input 
                  type="text" 
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="例: Next.js 実践ガイド"
                  className="w-full border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                />
              </div>

              {/* カテゴリー名 */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Tag size={14} /> カテゴリー名 (自由に作成可能)
                </label>
                <input 
                  type="text" 
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="例: プログラミング, 英語, 自己啓発"
                  className="w-full border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                />
              </div>

              {/* テーマカラー選択 */}
              <div className="space-y-2 pb-2">
                <label className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: newColor }}></div>
                  テーマカラーを選択
                </label>
                <div className="flex flex-wrap gap-2.5 bg-muted/30 p-4 rounded-xl border border-border">
                  {PALETTE_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewColor(color)}
                      className={`w-8 h-8 rounded-full transition-all focus:outline-none ${newColor === color ? "ring-2 ring-offset-2 ring-primary scale-110 shadow-md" : "hover:scale-105"}`}
                      style={{ backgroundColor: color }}
                      aria-label="Select color"
                    />
                  ))}
                </div>
              </div>

              {/* 追加ボタン */}
              <button 
                onClick={handleSaveMaterial}
                disabled={!newTitle.trim() || !newCategory.trim()}
                className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                追加する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新機能: 勉強時間追加ダイアログ */}
      {timeModalMaterialId && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center items-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-2 duration-300"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Clock className="text-primary" size={22}/> 勉強時間の記録
              </h3>
              <button 
                onClick={() => {
                  setTimeModalMaterialId(null);
                  setEditLogId(null);
                }}
                className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex gap-4 justify-center py-4 text-center">
                {/* 時間セレクタ */}
                <div className="flex flex-col gap-2 flex-1 relative">
                  <label className="text-sm font-bold text-muted-foreground">時間 (h)</label>
                  <div className="flex bg-muted/30 border border-border rounded-xl overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all text-xl">
                    <select 
                      value={Math.floor(addTimeMins / 60)} 
                      onChange={(e) => setAddTimeMins(Number(e.target.value) * 60 + (addTimeMins % 60))}
                      className="w-full bg-transparent px-4 py-4 font-black text-foreground outline-none appearance-none cursor-pointer text-center"
                    >
                      {[...Array(25)].map((_, i) => <option key={i} value={i}>{i} h</option>)}
                    </select>
                  </div>
                </div>

                {/* 分セレクタ */}
                <div className="flex flex-col gap-2 flex-1 relative">
                  <label className="text-sm font-bold text-muted-foreground">分 (m)</label>
                  <div className="flex bg-muted/30 border border-border rounded-xl overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all text-xl">
                    <select 
                       value={addTimeMins % 60} 
                       onChange={(e) => setAddTimeMins(Math.floor(addTimeMins / 60) * 60 + Number(e.target.value))}
                       className="w-full bg-transparent px-4 py-4 font-black text-foreground outline-none appearance-none cursor-pointer text-center"
                    >
                      {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => <option key={m} value={m}>{m.toString().padStart(2, '0')} m</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <button 
                onClick={handleSaveStudyTime}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg"
              >
                {editLogId ? "変更を保存する" : "記録する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
