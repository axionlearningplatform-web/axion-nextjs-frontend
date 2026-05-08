"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"

import { PreviewPanel } from "@/components/questionEditor/previewPanel"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function QuestionEditor({
  initialData = null,

  subjects = [],
  lockedSubject = null,

  submitLabel = "Create Question",

  statusLabels = {
    loading: "Submitting question...",
    success: "Question submitted",
    error: "Failed to submit",
  },

  onSubmit,

  onDelete = null,
  deleting = false,

  errors,
  status,

  onClearErrors,
}) {

  const [subject, setSubject] = useState("")
  const [subjectId, setSubjectId] = useState("")

  const [marks, setMarks] = useState("1")

  const [questionText, setQuestionText] =
    useState("")

  const [math, setMath] = useState("")

  const [hints, setHints] = useState([
    {
      text: "",
      mark: "1",
    },
  ])

  const [graph, setGraph] = useState("")

  const [confirmDelete, setConfirmDelete] =
    useState(false)

  // PREFILL QUESTION DATA
  useEffect(() => {

    if (!initialData) return

    setSubject(initialData.subject || "")

    setMarks(
      String(initialData.marks || "1")
    )

    setQuestionText(
      initialData.question_text || ""
    )

    setMath(initialData.latex || "")

    setGraph(initialData.graph || "")

    setHints(
      initialData.hints?.length
        ? initialData.hints.map((hint) => ({
            text: hint.text || "",
            mark: String(hint.mark || "1"),
          }))
        : [
            {
              text: "",
              mark: "1",
            },
          ]
    )

  }, [initialData])

  // LOCKED SUBJECT SUPPORT
  useEffect(() => {

    if (!lockedSubject) return

    setSubject(lockedSubject.name || "")

    setSubjectId(
      lockedSubject.id
        ? String(lockedSubject.id)
        : ""
    )

  }, [lockedSubject])

  const addHint = () => {

    setHints([
      ...hints,
      {
        text: "",
        mark: "1",
      },
    ])
  }

  const updateHint = (
    index,
    field,
    value
  ) => {

    const newHints = [...hints]

    newHints[index][field] = value

    setHints(newHints)
  }

  const removeHint = (index) => {

    setHints(
      hints.filter((_, i) => i !== index)
    )
  }

  const handleSubmit = (e) => {

    e.preventDefault()

    const payload = {
      subject,
      subject_id: subjectId
        ? Number(subjectId)
        : null,

      marks: Number(marks),

      question_text: questionText,

      latex: math,

      graph,

      hints: hints.map((hint) => ({
        text: hint.text,
        mark: Number(hint.mark),
      })),
    }

    console.log("SUBMITTING:", payload)

    onSubmit(payload)
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">

      {/* LEFT */}
      <div className="flex flex-col gap-6">

        <Card
          className={cn(
            `
            w-full
            rounded-3xl
            border-[#54433c]/45
            bg-[#151515]
            text-[#e5e2e1]
            shadow-2xl
            shadow-black/20
            transition-colors
            `,
            errors?.question_text &&
              "border-destructive shadow-destructive/20"
          )}
        >

          <CardHeader>

            <div className="flex items-center justify-between">

              <CardTitle className="font-serif text-2xl font-semibold">

                {submitLabel === "Save Changes"
                  ? "Edit Question"
                  : "Create Question"}

              </CardTitle>

              {onDelete && (

                <div className="flex items-center gap-2">

                  {!confirmDelete ? (

                    <Button
                      type="button"
                      variant="destructive"
                      className="rounded-full"
                      onClick={() =>
                        setConfirmDelete(true)
                      }
                    >
                      Delete Question
                    </Button>

                  ) : (

                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={() =>
                          setConfirmDelete(false)
                        }
                      >
                        Cancel
                      </Button>

                      <Button
                        type="button"
                        variant="destructive"
                        className="rounded-full"
                        disabled={deleting}
                        onClick={onDelete}
                      >
                        {deleting
                          ? "Deleting..."
                          : "Confirm Delete"}
                      </Button>
                    </>
                  )}

                </div>
              )}

            </div>

          </CardHeader>

          <CardContent className="relative flex flex-col gap-6">

            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-6"
            >

              <FieldGroup className="flex flex-col gap-6">

                {/* SUBJECT + MARKS */}
                <div className="grid grid-cols-2 gap-4">

                  <Field>

                    <FieldLabel className="text-[#dac1b7]">
                      Subject
                    </FieldLabel>

                    {lockedSubject ? (

                      <Input
                        value={lockedSubject.name}
                        disabled
                        className="
                          rounded-full
                          border-[#2a2a2a]
                          bg-[#242424]
                          text-[#a28c83]
                        "
                      />

                    ) : subjects.length > 0 ? (

                      <select
                        value={subjectId}
                        onChange={(e) => {

                          const value =
                            e.target.value

                          setSubjectId(value)

                          const found =
                            subjects.find(
                              (s) =>
                                String(s.id) === value
                            )

                          setSubject(
                            found?.name || ""
                          )
                        }}
                        className="
                          h-10
                          rounded-full
                          border
                          border-[#2a2a2a]
                          bg-[#242424]
                          px-4
                          text-[#e5e2e1]
                        "
                      >

                        <option value="">
                          Select subject
                        </option>

                        {subjects.map((subject) => (

                          <option
                            key={subject.id}
                            value={subject.id}
                          >
                            {subject.name}
                          </option>
                        ))}

                      </select>

                    ) : (

                      <Input
                        value={subject}
                        className="
                          rounded-full
                          border-[#2a2a2a]
                          bg-[#242424]
                          text-[#a28c83]
                        "
                        onChange={(e) =>
                          setSubject(
                            e.target.value
                          )
                        }
                      />

                    )}

                  </Field>

                  <Field>

                    <FieldLabel className="text-[#dac1b7]">
                      Marks
                    </FieldLabel>

                    <Input
                      type="number"
                      className="
                        rounded-full
                        border-[#2a2a2a]
                        bg-[#242424]
                        text-[#e5e2e1]
                        focus-visible:ring-[#ffb595]/40
                      "
                      value={marks}
                      onChange={(e) =>
                        setMarks(e.target.value)
                      }
                    />

                  </Field>

                </div>

                {/* QUESTION */}
                <Field>

                  <FieldLabel className="text-[#dac1b7]">
                    Question
                  </FieldLabel>

                  <Textarea
                    className={cn(
                      `
                      min-h-[220px]
                      rounded-3xl
                      border-[#2a2a2a]
                      bg-[#242424]
                      p-5
                      text-[#e5e2e1]
                      focus-visible:ring-[#ffb595]/40
                      `,
                      errors?.question_text &&
                        `
                        border-destructive
                        focus-visible:ring-destructive
                        `
                    )}
                    value={questionText}
                    onChange={(e) => {

                      setQuestionText(
                        e.target.value
                      )

                      if (
                        errors?.question_text
                      ) {
                        onClearErrors()
                      }
                    }}
                  />

                  {errors?.question_text?.[0]
                    ?.message && (

                    <p className="mt-2 text-sm text-destructive">
                      {
                        errors.question_text[0]
                          .message
                      }
                    </p>
                  )}

                </Field>

                {/* LATEX */}
                <Field>

                  <FieldLabel className="text-[#dac1b7]">
                    Math (LaTeX)
                  </FieldLabel>

                  <Input
                    className="
                      rounded-full
                      border-[#2a2a2a]
                      bg-[#242424]
                      text-[#e5e2e1]
                      focus-visible:ring-[#ffb595]/40
                    "
                    value={math}
                    onChange={(e) =>
                      setMath(e.target.value)
                    }
                    placeholder="e.g. x^2 + 2x"
                  />

                </Field>

                {/* GRAPH */}
                <Field>

                  <FieldLabel className="text-[#dac1b7]">
                    Graph Equation
                  </FieldLabel>

                  <Input
                    className="
                      rounded-full
                      border-[#2a2a2a]
                      bg-[#242424]
                      text-[#e5e2e1]
                      focus-visible:ring-[#ffb595]/40
                    "
                    value={graph}
                    onChange={(e) =>
                      setGraph(e.target.value)
                    }
                    placeholder="e.g. x^2"
                  />

                </Field>

                {/* HINTS */}
                <Field>

                  <FieldLabel className="text-[#dac1b7]">
                    Hints
                  </FieldLabel>

                  <div className="flex flex-col gap-3">

                    {hints.map((hint, index) => (

                      <div
                        key={index}
                        className="flex gap-2"
                      >

                        <Input
                          placeholder="Hint"
                          className="
                            rounded-full
                            border-[#2a2a2a]
                            bg-[#242424]
                            text-[#e5e2e1]
                            focus-visible:ring-[#ffb595]/40
                          "
                          value={hint.text}
                          onChange={(e) =>
                            updateHint(
                              index,
                              "text",
                              e.target.value
                            )
                          }
                        />

                        <Input
                          type="number"
                          className="
                            w-24
                            rounded-full
                            border-[#2a2a2a]
                            bg-[#242424]
                            text-[#e5e2e1]
                            focus-visible:ring-[#ffb595]/40
                          "
                          value={hint.mark}
                          onChange={(e) =>
                            updateHint(
                              index,
                              "mark",
                              e.target.value
                            )
                          }
                        />

                        <Button
                          type="button"
                          variant="destructive"
                          className="
                            rounded-full
                            bg-[#6d2c2c]
                            text-[#ffdad6]
                            hover:bg-[#823636]
                          "
                          onClick={() =>
                            removeHint(index)
                          }
                        >
                          X
                        </Button>

                      </div>
                    ))}

                    <Button
  type="button"
  onClick={addHint}
  className="
    rounded-full
    border
    border-[#54433c]/40
    bg-[#242424]
    text-[#dac1b7]
    hover:bg-[#2d2d2d]
    hover:text-[#f3ddd2]
    hover:border-[#6b554c]
    transition-all
    duration-300
    shadow-none
  "
>
  + Add Hint
</Button>

                  </div>

                </Field>

                {/* SUBMIT */}
                <Button
  type="submit"
  className="
    rounded-full
    bg-[#ccb2a3d3]
    text-[#1a1817]
    text-lg
    hover:bg-[#ddbeaa]
    hover:text-black
    transition-all
    duration-300
    shadow-[0_0_0_1px_rgba(255,255,255,0.03)]
    hover:shadow-[0_8px_30px_rgba(255,220,200,0.06)]
    active:scale-[0.995]
  "
>

  {submitLabel}

</Button>

              </FieldGroup>

            </form>

            {/* STATUS */}
            <div
              className={cn(
                `
                overflow-hidden
                rounded-xl
                border
                transition-all
                duration-700
                ease-[cubic-bezier(0.22,1,0.36,1)]
                transform-gpu
                will-change-[max-height,opacity,padding,margin]
                `,

                status === "idle" &&
                  `
                  max-h-0
                  opacity-0
                  py-0
                  px-0
                  mt-0
                  border-transparent
                  `,

                status === "loading" &&
                  `
                  max-h-24
                  opacity-100
                  px-4
                  py-3
                  mt-2
                  border-white/10
                  bg-white/5
                  text-white/80
                  `,

                status === "success" &&
                  `
                  max-h-24
                  opacity-100
                  px-4
                  py-3
                  mt-2
                  border-emerald-500/20
                  bg-emerald-500/10
                  text-emerald-200
                  `,

                status === "error" &&
                  `
                  max-h-24
                  opacity-100
                  px-4
                  py-3
                  mt-2
                  border-red-500/20
                  bg-red-500/10
                  text-red-200
                  `
              )}
            >

              <div
                className={cn(
                  `
                  flex
                  items-center
                  gap-2
                  transition-all
                  duration-500
                  ease-out
                  `,
                  status === "idle" &&
                    "opacity-0 translate-y-1",

                  status !== "idle" &&
                    "opacity-100 translate-y-0"
                )}
              >

                <div
                  className={cn(
                    `
                    h-2
                    w-2
                    rounded-full
                    shrink-0
                    `,

                    status === "loading" &&
                      "bg-white/70 animate-pulse",

                    status === "success" &&
                      "bg-emerald-400",

                    status === "error" &&
                      "bg-red-400"
                  )}
                />

                <span>

                  {status === "loading" &&
                    statusLabels.loading}

                  {status === "success" &&
                    statusLabels.success}

                  {status === "error" &&
                    statusLabels.error}

                </span>

              </div>

            </div>

          </CardContent>

        </Card>

      </div>

      {/* RIGHT */}
      <PreviewPanel
        subject={subject}
        marks={marks}
        questionText={questionText}
        math={math}
        hints={hints}
        graph={graph}
      />

    </div>
  )
}