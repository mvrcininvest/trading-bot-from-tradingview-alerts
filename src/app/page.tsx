import { redirect } from "next/navigation";

export default function Home() {
  // Redirect to main dashboard (force deploy)
  // Last update: 2025-10-27 20:30:00 UTC
  redirect("/dashboard");
}