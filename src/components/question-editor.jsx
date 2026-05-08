"use client"

import { useState } from "react"
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
import { Graph } from "./questionEditor/graphEditor"

export function QuestionEditor({ className, onSubmit, errors, message, status, onClearErrors, ...props }) {
  const [subject, setSubject] = useState("")
  const [marks, setMarks] = useState("1")
  const [questionText, setQuestionText] = useState("")
  const [math, setMath] = useState("")
  const [hints, setHints] = useState([{ text: "", mark: "1" }])
  const [graph, setGraph] = useState("")

  const addHint = () => {
    setHints([...hints, { text: "", mark: 1 }])
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

  hints,
}

  console.log(payload)

  onSubmit(payload)
}

  return (
   <div className="grid lg:grid-cols-2 gap-8">

  {/* LEFT: EDITOR */}
  <div className="flex flex-col gap-6">
    <Card
  className={cn(
    "w-full transition-colors",
    errors?.question_text &&
      "border-destructive shadow-destructive/20"
  )}
>
      <CardHeader>
        <CardTitle>Create Question</CardTitle>
      </CardHeader>

      <CardContent className="relative flex flex-col gap-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <FieldGroup className="flex flex-col gap-6">

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>Subject</FieldLabel>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel>Marks</FieldLabel>
                <Input
                  type="number"
                  value={marks}
                  onChange={(e) => setMarks(e.target.value)}
                />
              </Field>
            </div>

            <Field>

  <FieldLabel>Question</FieldLabel>

  <Textarea
    className={cn(
      "min-h-37.5",
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

            <Field>
              <FieldLabel>Math (LaTeX)</FieldLabel>
              <Input
                value={math}
                onChange={(e) => setMath(e.target.value)}
                placeholder="e.g. x^2 + 2x"
              />
            </Field>

            <Field>
              <FieldLabel>Graph Equation</FieldLabel>
            <Input
              value={graph}
              onChange={(e) => setGraph(e.target.value)}
              placeholder="e.g. x^2"
            />
            </Field> 

            <Field>
              <FieldLabel>Hints</FieldLabel>

              {hints.map((hint, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Hint"
                    value={hint.text}
                    onChange={(e) =>
                      updateHint(index, "text", e.target.value)
                    }
                  />
                  <Input
                    type="number"
                    className="w-20"
                    value={hint.mark}
                      onChange={(e) =>
                      updateHint(index, "mark", e.target.value)
                    }
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => removeHint(index)}
                  >
                    X
                  </Button>
                </div>
              ))}

              <Button type="button" onClick={addHint}>
                + Add Hint
              </Button>
            </Field>

            <Button type="submit">Save</Button>

          </FieldGroup>
        </form>
        
        {message && (
  <div
  className={cn(
    `
    overflow-hidden
    rounded-xl
    border
    px-4
    transition-all
    duration-500
    ease-in-out
    shadow-lg
    `,

    status === "idle" &&
      "max-h-0 opacity-0 py-0 mt-0 border-transparent",

    status === "loading" &&
      `
      max-h-24
      opacity-100
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
      py-3
      mt-2
      border-emerald-500/20
      bg-emerald-500/10
      text-emerald-200
      `
  )}
>
  {status !== "idle" && (
    <div className="flex items-center gap-2">

      <div
        className={cn(
          "h-2 w-2 rounded-full",

          status === "loading" &&
            "bg-white/70 animate-pulse",

          status === "success" &&
            "bg-emerald-400"
        )}
      />

      <span>
        {status === "loading" && "Submitting question..."}
        {status === "success" && "Question submitted"}
      </span>

    </div>
  )}
</div>
)}
      </CardContent>
    </Card>
  </div>

  {/* RIGHT: PREVIEW */}
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