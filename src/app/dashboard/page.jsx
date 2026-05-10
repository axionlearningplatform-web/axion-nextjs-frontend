"use client"

import Link from "next/link"
import { Atom, Beaker, BookOpen, FunctionSquare, Sigma, Sparkles } from "lucide-react"

import { useAuth } from "@/components/authProvider"

const courseIcons = [Sigma, Beaker, Atom, BookOpen, FunctionSquare, Sparkles]

function roleLabel(role) {
  return role ? role.replaceAll("_", " ") : "Dashboard"
}

function readCompletion(membership) {
  return Math.max(
    0,
    Math.min(
      100,
      Number(
        membership?.completion_percent ??
          membership?.progress?.completion_percent ??
          membership?.progress?.completion ??
          0
      ) || 0
    )
  )
}

function CourseCard({ membership, index }) {
  const Icon = courseIcons[index % courseIcons.length]
  const completion = readCompletion(membership)
  const subject = membership.subject
  const year = membership.year || subject.year || membership.subject_year || "Assigned course"
  const topicCount = membership.topic_count ?? subject.topic_count
  const subtitle = topicCount == null
    ? year
    : `${year} · ${topicCount} ${topicCount === 1 ? "topic" : "topics"}`

  return (
    <Link
      href={`/subjects/${subject.slug}`}
      className="group rounded-xl border border-white/[0.07] bg-white/[0.03] p-7 transition-colors hover:border-[#c8864a]/45"
    >
      <span className="mb-8 flex size-12 items-center justify-center rounded-xl bg-[#c8864a]/10 text-[#c8864a]">
        <Icon className="size-[22px]" />
      </span>
      <h2 className="text-[24px] font-semibold leading-tight text-[#eee9e4]">
        {subject.name}
      </h2>
      <p className="mt-1.5 text-[15px] font-medium text-[#7b7067]">{subtitle}</p>
      <div className="mt-8 h-0.5 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-[#c8864a] transition-[width] duration-500"
          style={{ width: `${completion}%` }}
        />
      </div>
      <p className="mt-3 text-[14px] font-semibold text-[#766b62]">
        {completion}% complete
      </p>
    </Link>
  )
}

export default function DashboardPage() {
  const auth = useAuth()
  const courses = auth.subjectMemberships || []
  const label = roleLabel(auth.activeRole)
  const name = auth.username || "there"

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#16130f] px-6 py-16 text-[#eee9e4] md:px-14 lg:px-20">
      <section className="mx-auto w-full max-w-6xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c8864a]/50">
          {label}
        </p>
        <h1 className="mt-6 text-[clamp(2.4rem,3.6vw,4rem)] font-semibold leading-[1.04] text-[#eee9e4]">
          Welcome back,
          <span className="mt-1 block font-serif italic text-[#c8864a]">
            {name}.
          </span>
        </h1>

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {courses.map((membership, index) => (
            <CourseCard
              index={index}
              key={membership.subject.id || membership.subject.slug}
              membership={membership}
            />
          ))}
          {!courses.length && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-6 text-sm text-[#7b7067]">
              No courses have been assigned yet.
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
