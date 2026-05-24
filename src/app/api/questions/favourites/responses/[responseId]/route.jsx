import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"
import ApiProxy from "../../../../proxy"

const DJANGO_API_FAVOURITE_RESPONSES_URL = `${DJANGO_API_ENDPOINT}/questions/favourites/responses/`

export async function GET(request, context) {
  const params = await context.params
  const response = await ApiProxy.get(`${DJANGO_API_FAVOURITE_RESPONSES_URL}${params.responseId}/`, true)

  return NextResponse.json(response.data, { status: response.status })
}

export async function PATCH(request, context) {
  const params = await context.params
  const requestData = await request.json()
  const response = await ApiProxy.patch(
    `${DJANGO_API_FAVOURITE_RESPONSES_URL}${params.responseId}/`,
    requestData,
    true
  )

  return NextResponse.json(response.data, { status: response.status })
}

export async function DELETE(request, context) {
  const params = await context.params
  const response = await ApiProxy.delete(`${DJANGO_API_FAVOURITE_RESPONSES_URL}${params.responseId}/`, true)

  return new NextResponse(null, { status: response.status })
}
