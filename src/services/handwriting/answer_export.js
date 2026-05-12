import { renderPageToCanvas } from "./render_submission"

export async function exportHandwrittenAnswer({ questionId, pages, width, height }) {
  const scale = Math.min(Math.max(window.devicePixelRatio || 2, 2), 3)

  // Serialize stroke data — strip internal cache fields before sending
  const strokeData = {
    question_id: questionId,
    pages: pages.map((page, index) => ({
      page_number: index + 1,
      strokes: page.strokes.map(({ _outline, ...stroke }) => stroke),
    })),
  }

  const exportedPages = pages.map((page, index) => {
    const canvas = renderPageToCanvas({ page, width, height, scale, clean: true })
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