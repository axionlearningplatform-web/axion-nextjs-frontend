"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useAuth } from "@/components/authProvider"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const SIGNUP_URL = "/api/signup"

function getFieldError(errors, field) {
  return errors?.[field]?.[0]?.message
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

    try {
      const response = await fetch(SIGNUP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        setErrors(data)
        setMessage(data?.detail || "Could not create account")
        return
      }

      await auth.refreshUser()
      router.replace("/dashboard")
    } catch {
      setMessage("Could not reach signup server")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Create your account</CardTitle>
            <CardDescription>
              Start with an account. Subjects can be assigned later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="display_name">Display name</FieldLabel>
                  <Input
                    id="display_name"
                    name="display_name"
                    placeholder="Seth"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="username">Username</FieldLabel>
                  <Input
                    id="username"
                    name="username"
                    placeholder="seth"
                    required
                  />
                  {getFieldError(errors, "username") && (
                    <p className="text-sm text-destructive">
                      {getFieldError(errors, "username")}
                    </p>
                  )}
                </Field>

                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                  />
                  {getFieldError(errors, "email") && (
                    <p className="text-sm text-destructive">
                      {getFieldError(errors, "email")}
                    </p>
                  )}
                </Field>

                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                  />
                  {getFieldError(errors, "password") && (
                    <p className="text-sm text-destructive">
                      {getFieldError(errors, "password")}
                    </p>
                  )}
                </Field>

                <Field>
                  <FieldLabel htmlFor="password_confirm">
                    Confirm password
                  </FieldLabel>
                  <Input
                    id="password_confirm"
                    name="password_confirm"
                    type="password"
                    required
                  />
                  {getFieldError(errors, "password_confirm") && (
                    <p className="text-sm text-destructive">
                      {getFieldError(errors, "password_confirm")}
                    </p>
                  )}
                </Field>

                {message && (
                  <p className="text-sm text-destructive">
                    {message}
                  </p>
                )}

                <Field>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating account..." : "Create account"}
                  </Button>
                  <FieldDescription className="text-center">
                    Already have an account?{" "}
                    <Link href="/login" className="underline underline-offset-4">
                      Login
                    </Link>
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
