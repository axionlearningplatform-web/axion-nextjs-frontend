"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useAuth } from "@/components/authProvider"

const SIGNUP_URL = "/api/signup"

function getFieldError(errors, field) {
  return errors?.[field]?.[0]?.message
}

function AuthInput(props) {
  return (
    <input
      {...props}
      className="h-12 w-full rounded-lg border border-white/[0.08] bg-white/[0.035] px-4 text-[14px] text-[#eee9e4] outline-none transition-colors placeholder:text-[#766b62] focus:border-[#c8864a]/55"
    />
  )
}

export default function SignupPage() {
  const auth = useAuth()
  const router = useRouter()
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setErrors({})
    setMessage("")
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const payload = Object.fromEntries(formData)
    payload.password_confirm = payload.password
    delete payload.school
    delete payload.year

    try {
      const response = await fetch(SIGNUP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        setErrors(data)
        setMessage(data?.detail || "Could not create account.")
        return
      }

      await auth.refreshUser()
      router.replace("/dashboard")
    } catch {
      setMessage("Could not reach signup server.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#16130f] px-6 py-12 text-[#eee9e4]">
      <section className="w-full max-w-[400px] rounded-2xl border border-white/[0.07] bg-[#1c1814] p-9">
        <h1 className="font-serif text-[24px] font-semibold leading-tight text-[#eee9e4]">
          Create your account.
        </h1>
        <p className="mt-2 text-[13px] text-[#766b62]">
          Subjects are assigned by your teacher
        </p>

        <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
          <label className="grid gap-2">
            <span className="text-[12px] font-medium text-[#8a7f75]">Username</span>
            <AuthInput name="username" placeholder="shadowsethio2009" required />
            {getFieldError(errors, "username") && (
              <span className="text-[12px] text-red-200">{getFieldError(errors, "username")}</span>
            )}
          </label>

          <label className="grid gap-2">
            <span className="text-[12px] font-medium text-[#8a7f75]">Email</span>
            <AuthInput name="email" placeholder="m@example.com" required type="email" />
            {getFieldError(errors, "email") && (
              <span className="text-[12px] text-red-200">{getFieldError(errors, "email")}</span>
            )}
          </label>

          <label className="grid gap-2">
            <span className="text-[12px] font-medium text-[#8a7f75]">Password</span>
            <AuthInput name="password" required type="password" />
            {getFieldError(errors, "password") && (
              <span className="text-[12px] text-red-200">{getFieldError(errors, "password")}</span>
            )}
          </label>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
            <label className="grid gap-2">
              <span className="text-[12px] font-medium text-[#8a7f75]">School</span>
              <AuthInput name="school" placeholder="School name" />
            </label>
            <label className="grid gap-2">
              <span className="text-[12px] font-medium text-[#8a7f75]">Year</span>
              <AuthInput name="year" placeholder="12" />
            </label>
          </div>

          {message && <p className="text-[12px] text-red-200">{message}</p>}

          <button
            className="mt-2 h-12 w-full rounded-lg bg-[#d8c8b9] text-[15px] font-medium text-[#1a1410] transition-colors hover:bg-[#eadccd] disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-7 text-center text-[13px] text-[#766b62]">
          Already have an account?{" "}
          <Link className="font-medium text-[#c8864a]/80 hover:text-[#c8864a]" href="/login">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  )
}
