import type { Metadata } from "next";
import "./globals.css";
import VisualEditsMessenger from "../visual-edits/VisualEditsMessenger";
import ErrorReporter from "@/components/ErrorReporter";
import Script from "next/script";
import { Toaster } from "@/components/ui/sonner";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export const metadata: Metadata = {
  title: "Trading Bot - TradingView Alerts",
  description: "Automated trading bot with TradingView integration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 min-h-screen">
        <ErrorReporter />
        <Script
          src="https://slelguoygbfzlpylpxfs.supabase.co/storage/v1/object/public/scripts//route-messenger.js"
          strategy="afterInteractive"
          data-target-origin="*"
          data-message-type="ROUTE_CHANGE"
          data-include-search-params="true"
          data-only-in-iframe="true"
          data-debug="true"
          data-custom-data='{"appName": "YourApp", "version": "1.0.0", "greeting": "hi"}'
        />
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b border-gray-800 bg-gray-900/95 backdrop-blur supports-[backdrop-filter]:bg-gray-900/80 px-4">
              <SidebarTrigger className="-ml-1" />
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-gray-400">System Online</span>
              </div>
            </header>
            <main className="flex-1">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
        <Toaster />
        <VisualEditsMessenger />
      </body>
    </html>
  );
}