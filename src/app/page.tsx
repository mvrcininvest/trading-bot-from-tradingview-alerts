import { redirect } from "next/navigation";

export default function Home() {
  // Redirect to main dashboard
  // Force rebuild: 2025-11-23 21:00:00 UTC - Vercel cache fix v2
  redirect("/dashboard");
}