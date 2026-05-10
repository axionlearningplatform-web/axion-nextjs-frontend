import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"
import ApiProxy from "../../../proxy"

const DJANGO_API_QUESTIONS_URL = `${DJANGO_API_ENDPOINT}/questions/`

export async function POST(request, context) {
  try {
    const params = await context.params
    const body = await request.json()
    const response = await ApiProxy.post(
      `${DJANGO_API_QUESTIONS_URL}${params.id}/mark/`,
      body,
      true
    )

    return NextResponse.json(response.data, {
      status: response.status,
    })
  } catch (error) {
    return NextResponse.json(
      {
        message: "Marking failed",
        error: String(error),
      },
      { status: 500 }
    )
  }
}
