import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, Timestamp, FieldValue, serverTimestamp } from "firebase/firestore";
import { db } from "./config";

// ====== Types ======

export interface StudyMaterial {
  id: string; // Document ID
  title: string;
  categoryId: string; // e.g., 'english', 'programming'
  color: string; // Hex or Tailwind class
  isDeleted?: boolean; // 論理削除フラグ
}

export interface StudyLog {
  id: string;
  date: string; // YYYY-MM-DD
  materialId: string;
  durationMins: number;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD (Document ID)
  schedule: string;
  wakeTime: string;
  bedTime: string;
  routines: string[];
  todos: string[];
  dinner: string;
  diary: string;
  fulfillment: number;
  phoneTimeMins: number;
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
  createdAt: Timestamp | FieldValue | null;
  updatedAt?: Timestamp | FieldValue | null;
}

export interface Goal {
  id: string;
  title: string;
  type: 'year' | 'month' | 'longterm';
  date: string; // YYYY-MM-DD
  deadline?: string; // YYYY-MM-DD
  tags?: string[];
  isCompleted: boolean;
  createdAt: Timestamp | FieldValue | null;
}

// ====== Books (本管理) ======

export interface Book {
  id: string;
  title: string;
  status: 'reading' | 'finished';
  progress: number; // 0-100
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

export interface ReadingLog {
  id: string;
  bookId: string;
  date: string; // YYYY-MM-DD
  durationMins: number;
  createdAt: Timestamp | FieldValue | null;
}

// ====== Master Routines (既定のルーティン) ======

export interface MasterRoutine {
  id: string;
  text: string;
  order: number;
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
  const ref = doc(db, `users/${userId}/studyMaterials`, materialId);
  await updateDoc(ref, { isDeleted: true });
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
  const data: Partial<Memo> = { ...memo };
  if (!data.updatedAt) {
    data.updatedAt = serverTimestamp(); // Corrected: use serverTimestamp instead of new Date() as any
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

// ====== Goals (目標管理) ======

export const saveGoal = async (userId: string, goal: Omit<Goal, 'id' | 'createdAt'>, goalId?: string) => {
  if (!userId) throw new Error("No user ID");
  const ref = goalId 
    ? doc(db, `users/${userId}/goals`, goalId) 
    : doc(collection(db, `users/${userId}/goals`));
  
  const data: any = { ...goal };
  if (!goalId) {
    data.createdAt = serverTimestamp();
  }
  
  await setDoc(ref, data, { merge: true });
  return ref.id;
};

export const deleteGoal = async (userId: string, goalId: string) => {
  if (!userId) throw new Error("No user ID");
  await deleteDoc(doc(db, `users/${userId}/goals`, goalId));
};

export const toggleGoalCompletion = async (userId: string, goalId: string, isCompleted: boolean) => {
  if (!userId || !goalId) throw new Error("Missing ID");
  const ref = doc(db, `users/${userId}/goals`, goalId);
  await updateDoc(ref, { isCompleted });
};

// ====== Routines (ルーティン) ======

export interface RoutineItem {
  id: string;
  text: string;
  completed: boolean;
  date: string; // YYYY-MM-DD
  createdAt: Timestamp | FieldValue | null;
}

export const saveRoutine = async (userId: string, routine: { text: string; date: string; completed: boolean }, routineId?: string) => {
  if (!userId) throw new Error("No user ID");
  const ref = routineId
    ? doc(db, `users/${userId}/routines`, routineId)
    : doc(collection(db, `users/${userId}/routines`));
  const data: any = { ...routine };
  if (!routineId) data.createdAt = serverTimestamp();
  await setDoc(ref, data, { merge: true });
  return ref.id;
};

export const deleteRoutine = async (userId: string, routineId: string) => {
  if (!userId) throw new Error("No user ID");
  await deleteDoc(doc(db, `users/${userId}/routines`, routineId));
};

export const toggleRoutineCompletion = async (userId: string, routineId: string, completed: boolean) => {
  if (!userId) throw new Error("No user ID");
  await updateDoc(doc(db, `users/${userId}/routines`, routineId), { completed });
};

// ====== Todos (ToDoリスト) ======

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  date: string; // YYYY-MM-DD
  createdAt: Timestamp | FieldValue | null;
}

export const saveTodo = async (userId: string, todo: { text: string; date: string; completed: boolean }, todoId?: string) => {
  if (!userId) throw new Error("No user ID");
  const ref = todoId
    ? doc(db, `users/${userId}/todos`, todoId)
    : doc(collection(db, `users/${userId}/todos`));
  const data: any = { ...todo };
  if (!todoId) data.createdAt = serverTimestamp();
  await setDoc(ref, data, { merge: true });
  return ref.id;
};

export const deleteTodo = async (userId: string, todoId: string) => {
  if (!userId) throw new Error("No user ID");
  await deleteDoc(doc(db, `users/${userId}/todos`, todoId));
};

export const toggleTodoCompletion = async (userId: string, todoId: string, completed: boolean) => {
  if (!userId) throw new Error("No user ID");
  await updateDoc(doc(db, `users/${userId}/todos`, todoId), { completed });
};

// ====== Books CRUD ======

export const saveBook = async (userId: string, book: Omit<Book, 'id'>, bookId?: string) => {
  if (!userId) throw new Error("No user ID");
  const ref = bookId 
    ? doc(db, `users/${userId}/books`, bookId) 
    : doc(collection(db, `users/${userId}/books`));
  await setDoc(ref, book, { merge: true });
  return ref.id;
};

export const deleteBook = async (userId: string, bookId: string) => {
  if (!userId) throw new Error("No user ID");
  await deleteDoc(doc(db, `users/${userId}/books`, bookId));
};

export const getBooks = async (userId: string): Promise<Book[]> => {
  if (!userId) return [];
  const snapshot = await getDocs(collection(db, `users/${userId}/books`));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Book));
};

// ====== Reading Logs CRUD ======

export const saveReadingLog = async (userId: string, log: Omit<ReadingLog, 'id' | 'createdAt'>, logId?: string) => {
  if (!userId) throw new Error("No user ID");
  const ref = logId 
    ? doc(db, `users/${userId}/readingLogs`, logId)
    : doc(collection(db, `users/${userId}/readingLogs`));
  const data: any = { ...log };
  if (!logId) data.createdAt = serverTimestamp();
  await setDoc(ref, data, { merge: true });
  return ref.id;
};

export const getReadingLogsByBook = async (userId: string, bookId: string): Promise<ReadingLog[]> => {
  if (!userId) return [];
  const q = query(
    collection(db, `users/${userId}/readingLogs`),
    where("bookId", "==", bookId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReadingLog));
};

export const deleteReadingLog = async (userId: string, logId: string) => {
  if (!userId) throw new Error("No user ID");
  await deleteDoc(doc(db, `users/${userId}/readingLogs`, logId));
};

// ====== Master Routines CRUD ======

export const saveMasterRoutine = async (userId: string, routine: Omit<MasterRoutine, 'id'>, routineId?: string) => {
  if (!userId) throw new Error("No user ID");
  const ref = routineId 
    ? doc(db, `users/${userId}/masterRoutines`, routineId) 
    : doc(collection(db, `users/${userId}/masterRoutines`));
  await setDoc(ref, routine, { merge: true });
  return ref.id;
};

export const getMasterRoutines = async (userId: string): Promise<MasterRoutine[]> => {
  if (!userId) return [];
  const snapshot = await getDocs(collection(db, `users/${userId}/masterRoutines`));
  const routines = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MasterRoutine));
  return routines.sort((a, b) => a.order - b.order);
};

export const deleteMasterRoutine = async (userId: string, routineId: string) => {
  if (!userId) throw new Error("No user ID");
  await deleteDoc(doc(db, `users/${userId}/masterRoutines`, routineId));
};

