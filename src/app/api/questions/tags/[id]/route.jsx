import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"
import ApiProxy from "../../../proxy"

const DJANGO_TAGS_URL = `${DJANGO_API_ENDPOINT}/questions/tags/`

export async function PATCH(request, context) {
  const params = await context.params
  const body = await request.json()
  const response = await ApiProxy.patch(
    `${DJANGO_TAGS_URL}${params.id}/`,
    body,
    true
  )

  return NextResponse.json(
    response.data,
    { status: response.status }
  )
}

export async function DELETE(request, context) {
  const params = await context.params
  const response = await ApiProxy.delete(
    `${DJANGO_TAGS_URL}${params.id}/`,
    true
  )

  return NextResponse.json(
    response.data,
    { status: response.status }
  )
}
