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
  message,
  status,
  onClearErrors,
}) {

  const [subject, setSubject] = useState("")
  const [marks, setMarks] = useState("1")
  const [questionText, setQuestionText] = useState("")
  const [math, setMath] = useState("")
  const [hints, setHints] = useState([{ text: "", mark: "1" }])
  const [graph, setGraph] = useState("")
  const [confirmDelete, setConfirmDelete] =
  useState(false)

  // PREFILL DATA
  useEffect(() => {

    if (!initialData) return

    setSubject(initialData.subject || "")
    setMarks(String(initialData.marks || "1"))
    setQuestionText(initialData.question_text || "")
    setMath(initialData.latex || "")
    setGraph(initialData.graph || "")

    setHints(
      initialData.hints?.length
        ? initialData.hints.map((hint) => ({
            text: hint.text || "",
            mark: String(hint.mark || "1"),
          }))
        : [{ text: "", mark: "1" }]
    )

  }, [initialData])

  const addHint = () => {
    setHints([
      ...hints,
      {
        text: "",
        mark: "1",
      },
    ])
  }

  const updateHint = (index, field, value) => {

    const newHints = [...hints]

    newHints[index][field] = value

    setHints(newHints)
  }

  const removeHint = (index) => {
    setHints(hints.filter((_, i) => i !== index))
  }

  const handleSubmit = (e) => {

    e.preventDefault()

    const payload = {
      subject,
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
    <div className="grid lg:grid-cols-2 gap-8">

      {/* LEFT */}
      <div className="flex flex-col gap-6">

        <Card
          className={cn(
            "w-full transition-colors",
            errors?.question_text &&
              "border-destructive shadow-destructive/20"
          )}
        >

          <CardHeader>

  <div className="flex items-center justify-between">

    <CardTitle>
      {submitLabel === "Save Changes"
        ? "Edit Question"
        : "Create Question"}
    </CardTitle>

    {/* DELETE BUTTON ONLY IN EDIT MODE */}
    {onDelete && (

      <div className="flex items-center gap-2">

        {!confirmDelete ? (

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() =>
              setConfirmDelete(true)
            }
          >
            Delete Question
          </Button>

        ) : (

          <div className="flex items-center gap-2">

            <span className="text-sm text-muted-foreground">
              Are you sure?
            </span>

            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={onDelete}
            >
              {deleting
                ? "Deleting..."
                : "Yes Delete"}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setConfirmDelete(false)
              }
            >
              Cancel
            </Button>

          </div>
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

                    <FieldLabel>Subject</FieldLabel>

                    <Input
                      value={subject}
                      onChange={(e) =>
                        setSubject(e.target.value)
                      }
                    />

                  </Field>

                  <Field>

                    <FieldLabel>Marks</FieldLabel>

                    <Input
                      type="number"
                      value={marks}
                      onChange={(e) =>
                        setMarks(e.target.value)
                      }
                    />

                  </Field>

                </div>

                {/* QUESTION */}
                <Field>

                  <FieldLabel>Question</FieldLabel>

                  <Textarea
                    className={cn(
                      "min-h-[160px]",
                      errors?.question_text &&
                        "border-destructive focus-visible:ring-destructive"
                    )}
                    value={questionText}
                    onChange={(e) => {

                      setQuestionText(e.target.value)

                      if (errors?.question_text) {
                        onClearErrors()
                      }
                    }}
                  />

                  {errors?.question_text?.[0]?.message && (
                    <p className="text-sm text-destructive mt-2">
                      {errors.question_text[0].message}
                    </p>
                  )}

                </Field>

                {/* LATEX */}
                <Field>

                  <FieldLabel>Math (LaTeX)</FieldLabel>

                  <Input
                    value={math}
                    onChange={(e) =>
                      setMath(e.target.value)
                    }
                    placeholder="e.g. x^2 + 2x"
                  />

                </Field>

                {/* GRAPH */}
                <Field>

                  <FieldLabel>Graph Equation</FieldLabel>

                  <Input
                    value={graph}
                    onChange={(e) =>
                      setGraph(e.target.value)
                    }
                    placeholder="e.g. x^2"
                  />

                </Field>

                {/* HINTS */}
                <Field>

                  <FieldLabel>Hints</FieldLabel>

                  <div className="flex flex-col gap-3">

                    {hints.map((hint, index) => (

                      <div
                        key={index}
                        className="flex gap-2"
                      >

                        <Input
                          placeholder="Hint"
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
                          className="w-20"
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
                    >
                      + Add Hint
                    </Button>

                  </div>

                </Field>

                {/* SUBMIT */}
                <Button type="submit">

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
                    "h-2 w-2 rounded-full shrink-0",

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