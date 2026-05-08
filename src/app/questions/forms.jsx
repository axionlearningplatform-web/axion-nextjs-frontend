"use client"

import { GalleryVerticalEnd } from "lucide-react"
import { LoginForm } from "@/components/login-form"
import { useAuth } from "@/components/authProvider"
import { useState } from "react"
import { QuestionEditor } from "@/components/question-editor"

// -> url -> /login

const QUESTIONS_API_URL = "/api/questions/"

export default function Questions() {
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [status, setStatus] = useState("idle")
    
 async function handleSubmit(payload) {

  setStatus("idle")
  setErrors({})
  setError('')

const response = await fetch(QUESTIONS_API_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
})

if (response.ok) {

  setStatus("loading")

  // grey loading state
  setTimeout(() => {

    // green success state
    setStatus("success")
    setMessage("Question submitted")

    // disappear smoothly
    setTimeout(() => {
      setStatus("idle")
    }, 2200)

  }, 1500)

} else {

  const data = await response.json()

  setErrors(data)
  setError("Error saving question")

  setStatus("idle")
}
 }

 return (
  <div className="flex min-h-svh flex-col items-center bg-muted p-6 md:p-10">
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6">
      <a
        href="#"
        className="text-center text-2xl font-extrabold">
        Question Editor
      </a>
        <QuestionEditor
          onSubmit={handleSubmit}
          errors={errors}
          message={message}
          status={status}
          onClearErrors={() => setErrors({})}
        />
    </div>
  </div>
 )
}
