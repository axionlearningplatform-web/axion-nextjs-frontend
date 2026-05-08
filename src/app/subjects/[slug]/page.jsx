"use client"

import { useParams } from "next/navigation"

import { useAuth } from "@/components/authProvider"

export default function SubjectHomePage() {
  const auth = useAuth()
  const params = useParams()
  const membership = auth.subjectMemberships?.find(
    (item) => item.subject.slug === params.slug
  )
  const subjectName = membership?.subject?.name || "Axion"
  const name = auth.username || "there"

  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center px-8">
      <section className="w-full max-w-4xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#ffb595]">
          {membership?.role?.replaceAll("_", " ") || "Subject"}
        </p>
        <h1 className="max-w-3xl text-5xl font-bold leading-tight text-[#e5e2e1]">
          Welcome to Axion {subjectName}, {name}.
        </h1>
      </section>
    </main>
  )
}
