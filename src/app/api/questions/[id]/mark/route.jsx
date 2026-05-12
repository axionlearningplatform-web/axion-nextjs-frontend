import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"
import ApiProxy from "../../../proxy"

const DJANGO_API_QUESTIONS_URL = `${DJANGO_API_ENDPOINT}/questions/`

/** Node runtime — Edge limits body size and can break large handwriting payloads. */
export const runtime = "nodejs"

/** AI marking + vision can exceed default serverless timeouts on slow runs. */
export const maxDuration = 120

export async function POST(request, context) {
  let body
  try {
    body = await request.json()
  } catch (parseError) {
    return NextResponse.json(
      {
        detail:
          "Could not read submission (payload too large or invalid JSON). Try fewer pages, or ask your admin to raise API body limits.",
        message: String(parseError),
      },
      { status: 400 }
    )
  }

  try {
    const params = await context.params
    const response = await ApiProxy.post(
      `${DJANGO_API_QUESTIONS_URL}${params.id}/mark/`,
      body,
      true
    )

    return NextResponse.json(response.data, {
      status: response.status,
    })
  } catch (error) {
    console.error("[mark route]", error)
    return NextResponse.json(
      {
        detail: "Marking proxy failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
