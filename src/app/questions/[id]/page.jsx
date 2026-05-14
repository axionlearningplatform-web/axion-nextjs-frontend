"use client"

import { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"

import { useAuth } from "@/components/authProvider"
import fetcher from "@/lib/fetcher"
import { QuestionEditor } from "@/components/question-editor"

const QUESTIONS_API_URL = "/api/questions/"

function membershipMatchesSubject(membership, subjectId) {
  if (subjectId == null || membership?.subject?.id == null) return false
  return String(membership.subject.id) === String(subjectId)
}

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
    mutate: mutateQuestion,
  } = useSWR(lookupId ? `${QUESTIONS_API_URL}${lookupId}/` : null, fetcher)

  const auth = useAuth()
  const { data: subjects = [] } = useSWR("/api/subjects/", fetcher)
  const lockedSubject = subjects.find((subject) => subject.slug === params?.slug)

  const isHeadCoordinatorSubject = useMemo(() => {
    if (data?.subject_id == null) return false
    return (
      auth.subjectMemberships?.some(
        (m) => membershipMatchesSubject(m, data.subject_id) && m.role === "head_coordinator"
      ) ?? false
    )
  }, [auth.subjectMemberships, data?.subject_id])

  const taggingMode = isHeadCoordinatorSubject ? "full" : "hidden"

  const canDeleteQuestion = useMemo(() => {
    if (!data?.subject_id) return false
    if (isHeadCoordinatorSubject) return true
    if (data.moderation_status !== "rejected") return false
    const uid = auth.user?.id
    if (uid == null || data.user_id == null) return false
    if (String(uid) !== String(data.user_id)) return false
    return (
      auth.subjectMemberships?.some(
        (m) =>
          membershipMatchesSubject(m, data.subject_id) && m.role === "teacher_analyst"
      ) ?? false
    )
  }, [auth.subjectMemberships, auth.user?.id, data, isHeadCoordinatorSubject])

  async function handleSubmit(payload) {
    setErrors({})
    setMessage("")
    setStatus("loading")

    const response = await fetch(`${QUESTIONS_API_URL}${lookupId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(payload),
    })

    const responseData = await response.json()

    if (response.ok) {
      await mutateQuestion()
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
    const confirmed = window.confirm("Delete this question permanently?")

    if (!confirmed) return

    setDeleting(true)

    try {
      const response = await fetch(`${QUESTIONS_API_URL}${lookupId}/`, {
        method: "DELETE",
        credentials: "include",
      })

      if (response.ok) {
        router.push(lockedSubject ? `/subjects/${lockedSubject.slug}/questions` : "/questions")
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
    <div className="flex min-h-svh flex-col items-center bg-blend-saturation p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <h1 className="text-center font-serif text-3xl font-bold text-[#e5e2e1]">
          Question Editor
        </h1>

        {data?.moderation_status === "needs_revision" && taggingMode === "hidden" && (
          <div className="rounded-xl border border-orange-500/35 bg-orange-950/40 px-5 py-4 text-center text-sm leading-relaxed text-orange-100/95">
            <p className="font-semibold text-orange-200">Changes requested</p>
            <p className="mt-2 text-orange-100/80">
              A head coordinator asked for edits on this question. When you save changes, it is sent back to the
              moderation queue as submitted.
            </p>
          </div>
        )}

        {data?.moderation_status === "rejected" && taggingMode === "hidden" && (
          <div className="rounded-xl border border-red-500/35 bg-red-950/35 px-5 py-4 text-center text-sm leading-relaxed text-red-100/95">
            <p className="font-semibold text-red-200">Rejected</p>
            <p className="mt-2 text-red-100/85">
              This question was rejected by a head coordinator. You can edit it and save to send it back to the
              moderation queue, or delete it permanently if you no longer want it in the database.
            </p>
          </div>
        )}

        <QuestionEditor
          initialData={data}
          subjects={subjects}
          lockedSubject={lockedSubject}
          taggingMode={taggingMode}
          submitLabel="Save Changes"
          statusLabels={{
            loading: "Saving changes...",
            success: "Question updated",
            error: "Failed to update",
          }}
          onSubmit={handleSubmit}
          onDelete={canDeleteQuestion ? handleDelete : null}
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
