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
    <Card className="self-start w-full rounded-3xl border-[#54433c]/45 bg-[#151515] text-[#e5e2e1] shadow-2xl shadow-black/20">
      <CardHeader>
        <CardTitle className="font-serif text-2xl font-semibold">Live Preview</CardTitle>
      </CardHeader>

     <CardContent className="flex flex-col gap-6">

        {/* Subject + Marks */}
        <div className="flex justify-between text-sm text-[#a28c83]">
          <span>{subject || "Subject"}</span>
          <span>{marks} marks</span>
        </div>

        {/* Question */}
        <div className="prose prose-invert max-w-none text-base leading-relaxed text-[#e5e2e1]">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {questionText || "Your question will appear here..."}
      </ReactMarkdown>
      </div>

        {/* Math */}
        {math && (
          <div className="rounded-2xl border border-[#54433c]/35 bg-[#201f1f] p-4">
            <BlockMath math={math} />
          </div>
        )}

        {graph && (
  <div className="rounded-2xl border border-[#54433c]/35 bg-[#201f1f] p-4">
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
              className="flex justify-between rounded-xl bg-[#242424] p-3 text-sm"
              >
                <span>{hint.text || "Hint..."}</span>
                <span className="text-xs text-[#a28c83]">
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
