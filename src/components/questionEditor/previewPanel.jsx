//Preview Editor

import { BlockMath } from "react-katex"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Graph } from "./graphEditor"

export function PreviewPanel({ subject, marks, questionText, math, hints, graph}) {
  return (
    <Card className="self-start w-full">
      <CardHeader>
        <CardTitle>Live Preview</CardTitle>
      </CardHeader>

     <CardContent className="flex flex-col gap-6">

        {/* Subject + Marks */}
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{subject || "Subject"}</span>
          <span>{marks} marks</span>
        </div>

        {/* Question */}
        <div className="prose max-w-none text-base leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {questionText || "Your question will appear here..."}
      </ReactMarkdown>
      </div>

        {/* Math */}
        {math && (
          <div className="bg-muted p-4 rounded-md">
            <BlockMath math={math} />
          </div>
        )}

        {graph && (
  <div className="p-4 border rounded-lg bg-muted/50">
      <Graph equation={graph} /> 
  </div>
)}


        {/* Hints */}
        {hints.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="font-semibold">Hints:</div>
            {hints.map((hint, i) => (
              <div
                key={i}
                className="text-sm bg-muted p-2 rounded-md flex justify-between"
              >
                <span>{hint.text || "Hint..."}</span>
                <span className="text-xs text-muted-foreground">
                  {hint.mark} mark
                </span>
              </div>
            ))}
          </div>
        )}

      </CardContent>
    </Card>
  )
}