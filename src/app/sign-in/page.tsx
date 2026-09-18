import type { Metadata } from "next";
import SignInForm from "@/components/SignInForm";
import { getPulseStats } from "@/lib/pulse-stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — AI·Thoughts",
  description: "Sign in with an email code — no password — to share how AI makes you feel.",
};

export default async function SignInPage() {
  const { total } = await getPulseStats();
  return <SignInForm total={total} />;
}
