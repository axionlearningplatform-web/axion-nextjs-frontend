import { renderPageToCanvas } from "./render_submission"
import { serializeAnswer } from "./stroke_serializer"

export async function exportHandwrittenAnswer({ questionId, pages, width, height }) {
  const scale = Math.min(Math.max(window.devicePixelRatio || 2, 2), 3)
  const strokeData = serializeAnswer({ questionId, pages })
  const exportedPages = pages.map((page, index) => {
    const canvas = renderPageToCanvas({
      page,
      width,
      height,
      scale,
      clean: true,
    })

    return {
      page_number: index + 1,
      page_image: canvas.toDataURL("image/png", 0.96),
    }
  })

  return {
    question_id: questionId,
    pages: exportedPages,
    stroke_data: strokeData,
  }
}
