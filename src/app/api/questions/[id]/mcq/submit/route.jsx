import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"
import ApiProxy from "../../../../proxy"

const DJANGO_API_QUESTIONS_URL = `${DJANGO_API_ENDPOINT}/questions/`

export async function POST(request, context) {
  try {
    const body = await request.json()
    const params = await context.params
    const response = await ApiProxy.post(
      `${DJANGO_API_QUESTIONS_URL}${params.id}/mcq/submit/`,
      body,
      true
    )

    return NextResponse.json(response.data, {
      status: response.status,
    })
  } catch (error) {
    return NextResponse.json(
      {
        detail: "Could not submit multiple choice answer.",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
