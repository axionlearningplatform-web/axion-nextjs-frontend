import { useEffect, useRef } from "react"

import { renderPageToCanvas } from "@/services/handwriting/render_submission"

export default function StrokeRenderer({ page, width = 300, height = 210, clean = false }) {
  const hostRef = useRef(null)

  useEffect(() => {
    if (!hostRef.current || !page) return
    hostRef.current.innerHTML = ""
    const canvas = renderPageToCanvas({ page, width, height, scale: 1, clean })
    canvas.className = "h-full w-full rounded-[6px] object-contain"
    hostRef.current.appendChild(canvas)
  }, [clean, height, page, width])

  return <div ref={hostRef} className="aspect-[10/7] w-full overflow-hidden rounded-[6px] border border-white/[0.06]" />
}
