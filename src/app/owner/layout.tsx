import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Owner dashboard · AI·Thoughts",
  robots: { index: false, follow: false },
};

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
