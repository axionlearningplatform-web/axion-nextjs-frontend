export function createStroke({ tool, color, width, points }) {
  return {
    id: crypto.randomUUID(),
    tool,
    color,
    width,
    points,
  }
}

export function createPoint(event, canvas, rect = canvas.getBoundingClientRect()) {
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    pressure: event.pressure || 0.5,
    timestamp: event.timeStamp || Date.now(),
  }
}

export function serializeAnswer({ questionId, pages }) {
  return {
    question_id: questionId,
    pages: pages.map((page, index) => ({
      page_number: index + 1,
      strokes: page.strokes || [],
    })),
  }
}
