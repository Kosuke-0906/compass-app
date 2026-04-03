"use client";
import { useLanguage } from "@/context/LanguageContext";
import { Globe } from "lucide-react";

export function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage();
  return (
    <button 
      onClick={toggleLanguage}
      className="fixed top-4 right-4 z-50 bg-white shadow-md border border-border rounded-full px-3 py-1.5 flex items-center gap-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
    >
      <Globe size={16} className="text-primary" />
      {language === 'ja' ? 'EN' : 'JA'}
    </button>
  );
}
