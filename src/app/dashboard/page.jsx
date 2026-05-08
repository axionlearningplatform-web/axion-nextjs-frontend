"use client"

import { useAuth } from "@/components/authProvider"

export default function DashboardPage() {
  const auth = useAuth()

  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center px-8">
      <section className="w-full max-w-4xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#ffb595]">
          Dashboard
        </p>
        <h1 className="max-w-3xl text-5xl font-bold leading-tight text-[#e5e2e1]">
          Welcome to Axion, {auth.username || "there"}.
        </h1>
      </section>
    </main>
  )
}
