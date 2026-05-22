import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"
import ApiProxy from "../../../../proxy"

const DJANGO_API_FAVOURITES_URL = `${DJANGO_API_ENDPOINT}/questions/favourites/`

export async function GET(request, context) {
  const params = await context.params
  const response = await ApiProxy.get(
    `${DJANGO_API_FAVOURITES_URL}${params.questionId}/exists/`,
    true
  )

  return NextResponse.json(response.data, { status: response.status })
}
