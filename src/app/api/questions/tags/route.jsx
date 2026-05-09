import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"
import ApiProxy from "../../proxy"

const DJANGO_TAGS_URL = `${DJANGO_API_ENDPOINT}/questions/tags/`

export async function GET(request) {
  const { search } = new URL(request.url)
  const response = await ApiProxy.get(
    `${DJANGO_TAGS_URL}${search}`,
    true
  )

  return NextResponse.json(
    response.data,
    { status: response.status }
  )
}
