import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { getToken } from "@/lib/auth"
import { NextResponse } from "next/server"

const DJANGO_API_QUESTIONS_URL = `${DJANGO_API_ENDPOINT}/questions/`

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(request, context) {
  let formData
  try {
    formData = await request.formData()
  } catch (error) {
    return NextResponse.json(
      {
        detail: "Could not read handwritten submission.",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 400 }
    )
  }

  try {
    const params = await context.params
    const headers = { Accept: "application/json" }
    const token = await getToken()
    if (token) headers.Authorization = `Bearer ${token}`

    const response = await fetch(
      `${DJANGO_API_QUESTIONS_URL}${params.id}/mark/upload/`,
      {
        method: "POST",
        headers,
        body: formData,
      }
    )
    const text = await response.text()
    let data = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { message: "Backend returned a non-JSON response", raw: text }
    }

    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error("[mark upload route]", error)
    return NextResponse.json(
      {
        detail: "Marking upload proxy failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
