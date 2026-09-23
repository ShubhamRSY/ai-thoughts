import Link from "next/link";
import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Contact — AI·Thoughts",
  description: "Privacy requests, data removal, or questions for the AI·Thoughts community keepers.",
};

export default function ContactPage() {
  return (
    <div className="app-rail min-h-dvh py-8">
      <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">Contact</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Privacy requests, data removal, or questions for community keepers.
      </p>

      <ContactForm />

      <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
        Keepers reply through the contact form above.
      </p>

      <div className="mt-8">
        <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back home
        </Link>
      </div>
    </div>
  );
}
