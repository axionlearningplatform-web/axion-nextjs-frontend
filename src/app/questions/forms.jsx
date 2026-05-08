"use client"

import { useState } from "react"

import { QuestionEditor } from "@/components/question-editor"

const QUESTIONS_API_URL = "/api/questions/"

export default function Questions() {

  const [message, setMessage] = useState("")
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState("idle")

  async function handleSubmit(payload) {

    setErrors({})
    setMessage("")

    setStatus("loading")

    const response = await fetch(
      QUESTIONS_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    )

    const responseData = await response.json()

    if (response.ok) {

      setTimeout(() => {

        setStatus("success")
        setMessage("Question submitted")

        setTimeout(() => {

          setStatus("idle")
          setMessage("")

        }, 2500)

      }, 1000)

    } else {

      console.log(responseData)

      setErrors(responseData)

      setTimeout(() => {

        setStatus("error")
        setMessage("Failed to submit")

        setTimeout(() => {

          setStatus("idle")
          setMessage("")

        }, 2200)

      }, 800)
    }
  }

  return (

    <div className="flex min-h-svh flex-col items-center bg-muted p-6 md:p-10">

      <div className="w-full max-w-7xl mx-auto flex flex-col gap-6">

        <h1 className="text-center text-2xl font-extrabold">
          Create Question
        </h1>

        <QuestionEditor

          submitLabel="Create Question"

          statusLabels={{
            loading: "Creating question...",
            success: "Question created",
            error: "Failed to create question",
          }}

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