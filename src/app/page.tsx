import { redirect } from "next/navigation";

export default function Home() {
  // Redirect to main dashboard (force deploy)
  redirect("/dashboard");
}