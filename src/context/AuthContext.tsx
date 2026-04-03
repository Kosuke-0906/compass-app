"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut as firebaseSignOut, getRedirectResult } from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { Compass } from "lucide-react";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // リダイレクト結果をキャッチ（PWAモード等）
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          console.log("[Compass] Login via redirect successful:", result.user.email);
        }
      } catch (err) {
        console.error("[Compass] Redirect login error:", err);
      }
    };
    checkRedirect();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("[Compass] Auth state changed: Logged in as", user.email);
      } else {
        console.log("[Compass] Auth state changed: Logged out");
      }
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      // PWA standaloneモード(iPhoneホーム画面)ではリダイレクト、通常ブラウザではポップアップ
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || ('standalone' in window.navigator && (window.navigator as any).standalone);
      if (isStandalone) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (error) {
      console.error("Error signing in with Google", error);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {loading ? (
        <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30">
          <Compass className="text-primary animate-spin mb-4" size={48} />
          <p className="text-muted-foreground font-semibold">Loading Compass...</p>
        </div>
      ) : !user ? (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-border max-w-sm w-full text-center space-y-6">
            <div className="flex justify-center mb-2">
              <div className="bg-primary/10 p-4 rounded-full">
                <Compass className="text-primary" size={40} />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-foreground tracking-tight mb-2">Compassへようこそ</h1>
              <p className="text-sm text-muted-foreground">ログインして目標・学習記録を管理しましょう。</p>
            </div>
            <button 
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white border border-border shadow-sm text-foreground py-3 px-4 rounded-xl font-bold hover:bg-slate-50 transition-colors focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Googleでログイン
            </button>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
