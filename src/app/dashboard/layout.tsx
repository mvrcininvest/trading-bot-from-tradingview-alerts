"use client";

import { useEffect } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // PWA Registration
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(
        (registration) => {
          console.log('✅ Service Worker registered:', registration);
        },
        (error) => {
          console.error('❌ Service Worker registration failed:', error);
        }
      );
    }
  }, []);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="w-full">
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b border-gray-800 bg-gray-900/95 backdrop-blur supports-[backdrop-filter]:bg-gray-900/80 px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-gray-400">Trading Bot Online</span>
          </div>
        </header>
        <main className="flex-1">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
