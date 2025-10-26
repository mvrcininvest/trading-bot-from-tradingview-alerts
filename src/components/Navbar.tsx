"use client";

import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TrendingUp, Bell, History, FileText, Settings, Bot, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: TrendingUp },
    { href: "/alerts", label: "Alerty", icon: Bell },
    { href: "/bot-history", label: "Historia", icon: History },
    { href: "/logi-bota", label: "Logi", icon: FileText },
    { href: "/ustawienia-bota", label: "Ustawienia Bota", icon: Bot },
    { href: "/exchange-test", label: "API Exchange", icon: Settings },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-gray-800 bg-gray-900/95 backdrop-blur supports-[backdrop-filter]:bg-gray-900/80">
      <div className="max-w-7xl mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 border border-blue-500/30">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Trading Bot
            </span>
          </button>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              
              return (
                <Button
                  key={item.href}
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  onClick={() => router.push(item.href)}
                  className={cn(
                    "gap-2 transition-all",
                    isActive
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
