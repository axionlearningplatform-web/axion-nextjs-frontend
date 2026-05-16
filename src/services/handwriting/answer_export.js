import { renderPageToCanvas } from "./render_submission"

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      try {
        const dataUrl = canvas.toDataURL(type, quality)
        const [header, encoded] = dataUrl.split(",")
        const mimeMatch = header.match(/data:(.*?);base64/)
        const binary = atob(encoded || "")
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
        resolve(new Blob([bytes], { type: mimeMatch?.[1] || type }))
      } catch (error) {
        reject(error)
      }
    }, type, quality)
  })
}

function serialiseStroke(stroke) {
  return {
    id: stroke.id,
    tool: stroke.tool,
    color: stroke.color,
    width: stroke.width,
    points: (stroke.points || []).map((point) => ({
      x: point.x,
      y: point.y,
      pressure: point.pressure,
      timestamp: point.timestamp,
    })),
  }
}

export async function exportHandwrittenAnswer({ questionId, pages, width, height }) {
  const scale = 1
  const mimeType = "image/jpeg"
  const quality = 0.7

  const exportedPages = []
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    const startedAt = performance.now()
    const canvas = renderPageToCanvas({ page, width, height, scale, clean: true })
    const blob = await canvasToBlob(canvas, mimeType, quality)
    exportedPages.push({
      page_number: index + 1,
      blob,
      mime_type: mimeType,
      filename: `handwriting-page-${index + 1}.jpg`,
      width: canvas.width,
      height: canvas.height,
      scale,
      byte_size: blob.size,
      render_ms: Math.round(performance.now() - startedAt),
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return {
    question_id: questionId,
    pages: exportedPages,
    stroke_data: {
      version: 1,
      width,
      height,
      pages: pages.map((page, index) => ({
        page_number: index + 1,
        strokes: (page.strokes || []).map(serialiseStroke),
      })),
    },
  }
}
