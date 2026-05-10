"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { useAuth } from "@/components/authProvider"

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning,"
  if (hour < 18) return "Good afternoon,"
  return "Good evening,"
}

function ActionCard({ label, title, href, cta }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5 transition-colors hover:border-[#c8864a]/35"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#746960]">
        {label}
      </p>
      <h2 className="mt-5 text-[21px] font-semibold text-[#eee9e4]">{title}</h2>
      <p className="mt-7 text-[15px] font-semibold text-[#c8864a]">{cta}</p>
    </Link>
  )
}

export default function SubjectHomePage() {
  const auth = useAuth()
  const params = useParams()
  const membership = auth.subjectMemberships?.find(
    (item) => item.subject.slug === params.slug
  )
  const subject = membership?.subject
  const subjectName = subject?.name || "Subject"
  const year = membership?.year || subject?.year || "Year 12"
  const name = auth.username || "there"

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#16130f] px-6 py-14 text-[#eee9e4] md:px-14 lg:px-20">
      <section className="mx-auto w-full max-w-6xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c8864a]/55">
          {subjectName} · {year}
        </p>
        <h1 className="mt-6 font-serif text-[clamp(3rem,5.4vw,5.4rem)] font-medium leading-[0.98] text-[#eee9e4]">
          {greeting()}
          <span className="block italic text-[#c8864a]">{name}.</span>
        </h1>

        <div className="my-12 h-px bg-white/[0.07]" />

        <div className="grid gap-5 lg:grid-cols-2">
          <ActionCard
            cta="Begin session →"
            href={`/subjects/${params.slug}/practice`}
            label="Daily Practice"
            title="Keep your streak alive."
          />
          <ActionCard
            cta="Resume course →"
            href={`/subjects/${params.slug}`}
            label="Development"
            title="Continue where you left off."
          />
        </div>
      </section>
    </main>
  )
}
