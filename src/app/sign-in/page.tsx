import SignInForm from "@/components/SignInForm";
import { getPulseStats } from "@/lib/pulse-stats";

export const revalidate = 60;

export default async function SignInPage() {
  const { total } = await getPulseStats();
  return <SignInForm total={total} />;
}
