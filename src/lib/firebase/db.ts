import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy } from "firebase/firestore";
import { db } from "./config";

// ====== Types ======

export interface StudyMaterial {
  id: string; // Document ID
  title: string;
  categoryId: string; // e.g., 'english', 'programming'
  color: string; // Hex or Tailwind class
}

export interface StudyLog {
  id: string;
  date: string; // YYYY-MM-DD
  materialId: string;
  durationMins: number;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD (Document ID)
  wakeTime: string;
  bedTime: string;
  routines: any[];
  todos: any[];
  dinner: string;
  diary: string;
  fulfillment: number;
  phoneTimeMins: number;
  // studyTimeMins is derived from StudyLogs, but we can cache it here if needed
}

export interface MemoTag {
  id: string;
  name: string;
  color: string;
}

export interface Memo {
  id: string;
  text: string;
  date: string; // ISO String or human readable
  tags: string[]; // tag IDs or names
  isFavorite: boolean;
  isPinned: boolean;
  createdAt: any;
}

// ====== Study Materials (教材管理) ======

export const getStudyMaterials = async (userId: string): Promise<StudyMaterial[]> => {
  if (!userId) return [];
  const snapshot = await getDocs(collection(db, `users/${userId}/studyMaterials`));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudyMaterial));
};

export const saveStudyMaterial = async (userId: string, material: Omit<StudyMaterial, 'id'>, materialId?: string) => {
  if (!userId) throw new Error("No user ID");
  const ref = materialId 
    ? doc(db, `users/${userId}/studyMaterials`, materialId) 
    : doc(collection(db, `users/${userId}/studyMaterials`));
  
  await setDoc(ref, material, { merge: true });
  return ref.id;
};

export const deleteStudyMaterial = async (userId: string, materialId: string) => {
  if (!userId) throw new Error("No user ID");
  await deleteDoc(doc(db, `users/${userId}/studyMaterials`, materialId));
};

// ====== Study Logs (学習記録) ======

export const getStudyLogsByDateRange = async (userId: string, startDate: string, endDate: string): Promise<StudyLog[]> => {
  if (!userId) return [];
  const q = query(
    collection(db, `users/${userId}/studyLogs`),
    where("date", ">=", startDate),
    where("date", "<=", endDate)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudyLog));
};

export const saveStudyLog = async (userId: string, log: Omit<StudyLog, 'id'>) => {
  if (!userId) throw new Error("No user ID");
  const ref = doc(collection(db, `users/${userId}/studyLogs`));
  await setDoc(ref, log);
  return ref.id;
};

export const updateStudyLog = async (userId: string, logId: string, durationMins: number) => {
  if (!userId || !logId) throw new Error("No User ID or Log ID");
  const ref = doc(db, `users/${userId}/studyLogs`, logId);
  await updateDoc(ref, { durationMins });
};

export const deleteStudyLog = async (userId: string, logId: string) => {
  if (!userId || !logId) throw new Error("No User ID or Log ID");
  const ref = doc(db, `users/${userId}/studyLogs`, logId);
  await deleteDoc(ref);
};

// ====== Daily Logs (日々の記録) ======

export const getDailyLog = async (userId: string, date: string): Promise<DailyLog | null> => {
  if (!userId) return null;
  const docRef = doc(db, `users/${userId}/dailyLogs`, date);
  const snapshot = await getDoc(docRef);
  return snapshot.exists() ? (snapshot.data() as DailyLog) : null;
};

export const saveDailyLog = async (userId: string, date: string, data: Partial<DailyLog>) => {
  if (!userId) throw new Error("No user ID");
  const docRef = doc(db, `users/${userId}/dailyLogs`, date);
  await setDoc(docRef, data, { merge: true });
};

// ====== Memos & Memo Tags (メモ・タグ管理) ======

export const saveMemo = async (userId: string, memo: Omit<Memo, 'id'>, memoId?: string) => {
  if (!userId) throw new Error("No user ID");
  const ref = memoId 
    ? doc(db, `users/${userId}/memos`, memoId) 
    : doc(collection(db, `users/${userId}/memos`));
  
  // もしmemo自体にupdatedAtがなければ、ここでセットする
  const data = { ...memo };
  if (!(data as any).updatedAt) {
    (data as any).updatedAt = new Date(); // Fallback
  }
  
  await setDoc(ref, data, { merge: true });
  return ref.id;
};

export const deleteMemo = async (userId: string, memoId: string) => {
  if (!userId) throw new Error("No user ID");
  await deleteDoc(doc(db, `users/${userId}/memos`, memoId));
};

export const saveMemoTag = async (userId: string, tag: Omit<MemoTag, 'id'>, tagId?: string) => {
  if (!userId) throw new Error("No user ID");
  const ref = tagId 
    ? doc(db, `users/${userId}/memoTags`, tagId) 
    : doc(collection(db, `users/${userId}/memoTags`));
  await setDoc(ref, tag, { merge: true });
  return ref.id;
};

export const deleteMemoTag = async (userId: string, tagId: string) => {
  if (!userId) throw new Error("No user ID");
  await deleteDoc(doc(db, `users/${userId}/memoTags`, tagId));
};
