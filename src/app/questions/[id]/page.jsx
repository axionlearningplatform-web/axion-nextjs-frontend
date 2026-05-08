"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import useSWR from "swr"

import fetcher from "@/lib/fetcher"
import { QuestionEditor } from "@/components/question-editor"
import { useRouter } from "next/navigation"

const QUESTIONS_API_URL = "/api/questions/"

export default function Page() {

  const params = useParams()
  const lookupId = params.id

  const [message, setMessage] = useState("")
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState("idle")

 const router = useRouter()

  const [deleting, setDeleting] = useState(false)

  const {
    data,
    error: fetchError,
    isLoading,
  } = useSWR(
    lookupId
      ? `${QUESTIONS_API_URL}${lookupId}/`
      : null,
    fetcher
  )

  async function handleSubmit(payload) {

    setErrors({})
    setMessage("")
    setStatus("loading")

    const response = await fetch(
      `${QUESTIONS_API_URL}${lookupId}/`,
      {
        method: "PATCH",
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
        setMessage("Question updated")

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
        setMessage("Failed to update")

        setTimeout(() => {
          setStatus("idle")
          setMessage("")
        }, 2200)

      }, 800)
    }
  }

  async function handleDelete() {

  const confirmed = window.confirm(
    "Delete this question permanently?"
  )

  if (!confirmed) return

  setDeleting(true)

  try {

    const response = await fetch(
      `${QUESTIONS_API_URL}${lookupId}/`,
      {
        method: "DELETE",
      }
    )

    if (response.ok) {

      router.push("/questions")

    } else {

      alert("Failed to delete question")
    }

  } catch (error) {

    console.log(error)

    alert("Something went wrong")
  }

  setDeleting(false)
}


  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        Loading question...
      </main>
    )
  }

  if (fetchError) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        Failed to load question
      </main>
    )
  }

if (!data) {
  return (
    <main className="flex min-h-screen items-center justify-center">
      No question found
    </main>
  )
}

return (
  <div className="flex min-h-svh flex-col items-center bg-muted p-6 md:p-10">

    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6">

      <h1 className="text-center text-2xl font-extrabold">
        Edit Question
      </h1>

     <QuestionEditor
  initialData={data}

  submitLabel="Save Changes"

  statusLabels={{
    loading: "Saving changes...",
    success: "Question updated",
    error: "Failed to update",
  }}

  onSubmit={handleSubmit}

  onDelete={handleDelete}
  deleting={deleting}

  errors={errors}
  message={message}
  status={status}

  onClearErrors={() => setErrors({})}
/>

    </div>

  </div>
)
}

