"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { dictionaries, Language, Dictionary } from '@/lib/i18n/dictionaries';

interface LanguageContextType {
  language: Language;
  toggleLanguage: () => void;
  dict: Dictionary;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('ja');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('compass_language') as Language;
    if (saved && (saved === 'en' || saved === 'ja')) {
      setLanguage(saved);
    }
    setMounted(true);
  }, []);

  const toggleLanguage = () => {
    const newLang = language === 'ja' ? 'en' : 'ja';
    setLanguage(newLang);
    localStorage.setItem('compass_language', newLang);
  };

  // サーバーサイド・初回Hydration時のチラつき防止のため
  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, dict: dictionaries[language] }}>
      <div className="contents" style={{ visibility: mounted ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
