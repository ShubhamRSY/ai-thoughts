import SignInForm from "@/components/SignInForm";
import { getPulseStats } from "@/lib/pulse-stats";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const { total } = await getPulseStats();
  return <SignInForm total={total} />;
}
