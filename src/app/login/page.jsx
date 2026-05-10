"use client"

import Link from "next/link"
import { useState } from "react"

import { useAuth } from "@/components/authProvider"

const LOGIN_URL = "/api/login"

function AuthInput(props) {
  return (
    <input
      {...props}
      className="h-12 w-full rounded-lg border border-white/[0.08] bg-white/[0.035] px-4 text-[14px] text-[#eee9e4] outline-none transition-colors placeholder:text-[#766b62] focus:border-[#c8864a]/55"
    />
  )
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
        fill="currentColor"
      />
    </svg>
  )
}

export default function LoginPage() {
  const auth = useAuth()
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage("")
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const payload = Object.fromEntries(formData)

    try {
      const response = await fetch(LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        await auth.login()
        return
      }

      setMessage("Could not sign in with those details.")
    } catch {
      setMessage("Could not reach login server.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#16130f] px-6 py-12 text-[#eee9e4]">
      <section className="w-full max-w-[400px] rounded-2xl border border-white/[0.07] bg-[#1c1814] p-9">
        <h1 className="font-serif text-[24px] font-semibold leading-tight text-[#eee9e4]">
          Welcome back.
        </h1>
        <p className="mt-2 text-[13px] text-[#766b62]">
          Sign in to your account to continue
        </p>

        <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
          <button
            type="button"
            disabled
            className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[14px] font-medium text-[#9a8e84] opacity-70"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <label className="grid gap-2">
            <span className="text-[12px] font-medium text-[#8a7f75]">Username or email</span>
            <AuthInput name="username" placeholder="m@example.com" required />
          </label>

          <label className="grid gap-2">
            <span className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-medium text-[#8a7f75]">Password</span>
              <a className="text-[12px] font-medium text-[#c8864a]/70 hover:text-[#c8864a]" href="#">
                Forgot password?
              </a>
            </span>
            <AuthInput name="password" required type="password" />
          </label>

          {message && <p className="text-[12px] text-red-200">{message}</p>}

          <button
            className="mt-2 h-12 w-full rounded-lg bg-[#d8c8b9] text-[15px] font-medium text-[#1a1410] transition-colors hover:bg-[#eadccd] disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-7 text-center text-[13px] text-[#766b62]">
          Don&apos;t have an account?{" "}
          <Link className="font-medium text-[#c8864a]/80 hover:text-[#c8864a]" href="/signup">
            Sign up
          </Link>
        </p>
      </section>
    </main>
  )
}
