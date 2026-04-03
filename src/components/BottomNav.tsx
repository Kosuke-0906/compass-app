"use client";
import { Home, CalendarDays, Target, PenTool } from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { usePathname } from "next/navigation";

export function BottomNav() {
  const { dict } = useLanguage();
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 w-full bg-white border-t border-border flex justify-around items-center h-16 z-50 pb-safe">
      <Link href="/" className={`flex flex-col items-center transition-colors ${pathname === '/' ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}>
        <Home size={24} />
        <span className="text-xs mt-1 font-medium">{dict.common.daily}</span>
      </Link>
      <Link href="/goals" className={`flex flex-col items-center transition-colors ${pathname.startsWith('/goals') ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}>
        <Target size={24} />
        <span className="text-xs mt-1 font-medium">{dict.common.goals}</span>
      </Link>
      <Link href="/memos" className={`flex flex-col items-center transition-colors ${pathname.startsWith('/memos') ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}>
        <PenTool size={24} />
        <span className="text-xs mt-1 font-medium">{dict.common.memos}</span>
      </Link>
    </nav>
  );
}
