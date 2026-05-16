import { renderPageToCanvas } from "./render_submission"

export async function exportHandwrittenAnswer({ questionId, pages, width, height }) {
  const scale = 1

  const exportedPages = pages.map((page, index) => {
    const canvas = renderPageToCanvas({ page, width, height, scale, clean: true })
    return {
      page_number: index + 1,
      page_image: canvas.toDataURL("image/jpeg", 0.7),
    }
  })

  return {
    question_id: questionId,
    pages: exportedPages,
  }
}
