import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"
import ApiProxy from "../proxy"

const DJANGO_API_SUBJECTS_URL = `${DJANGO_API_ENDPOINT}/subjects/`

export async function GET() {
  const response = await ApiProxy.get(DJANGO_API_SUBJECTS_URL, true)

  return NextResponse.json(
    response.data,
    { status: response.status }
  )
}
