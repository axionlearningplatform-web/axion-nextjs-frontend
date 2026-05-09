import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"
import ApiProxy from "../../../proxy"

const DJANGO_IMPORT_PARSE_URL =
  `${DJANGO_API_ENDPOINT}/questions/import/parse/`

export async function POST(request) {
  const requestData = await request.json()

  const response = await ApiProxy.post(
    DJANGO_IMPORT_PARSE_URL,
    requestData,
    true
  )

  return NextResponse.json(
    response.data,
    { status: response.status }
  )
}
