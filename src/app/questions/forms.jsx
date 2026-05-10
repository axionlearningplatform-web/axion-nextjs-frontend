"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import useSWR from "swr"

import { QuestionEditor } from "@/components/question-editor"
import fetcher from "@/lib/fetcher"

const QUESTIONS_API_URL = "/api/questions/"
const SUBJECTS_API_URL = "/api/subjects/"

export default function Questions() {

  const [message, setMessage] = useState("")
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState("idle")
  const params = useParams()
  const { data: subjects = [] } = useSWR(SUBJECTS_API_URL, fetcher)
  const lockedSubject = subjects.find(
    (subject) => subject.slug === params?.slug
  )

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

    <div className="flex min-h-[calc(100vh-64px)] flex-col items-center bg-[#16130f] px-6 py-10 md:px-10">

      <div className="w-full max-w-7xl mx-auto flex flex-col gap-8">

        <h1 className="text-center font-serif text-3xl font-bold text-[#e5e2e1]">
          Create Question
        </h1>

        <QuestionEditor
          subjects={subjects}
          lockedSubject={lockedSubject}

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
