"use client"

import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/components/authProvider"

const LOGOUT_URL = "/api/logout/"

export default function LogoutPage() {
  const auth = useAuth()
  const router = useRouter()

  async function handleClick(event) {
    event.preventDefault()
    const response = await fetch(LOGOUT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "jsonData",
    })
    if (response.ok) {
      auth.logout()
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#16130f] px-6 text-[#eee9e4]">
      <section className="w-full max-w-[320px] text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-[#c8864a]/25 bg-[#c8864a]/10 text-[#c8864a]">
          <LogOut className="size-6" />
        </div>
        <h1 className="mt-8 font-serif text-[28px] font-semibold text-[#eee9e4]">
          Sign out?
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[#766b62]">
          You&apos;ll need to sign back in to access your courses and progress.
        </p>
        <div className="mt-9 grid grid-cols-2 gap-3">
          <button
            className="h-11 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[14px] font-medium text-[#eee9e4] transition-colors hover:bg-white/[0.07]"
            onClick={() => router.back()}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-lg border border-[#c8864a]/30 bg-[#c8864a]/12 text-[14px] font-medium text-[#c8864a] transition-colors hover:bg-[#c8864a]/18"
            onClick={handleClick}
            type="button"
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  )
}
