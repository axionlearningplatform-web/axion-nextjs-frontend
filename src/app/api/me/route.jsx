import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"
import ApiProxy from "../proxy"

const DJANGO_API_ME_URL = `${DJANGO_API_ENDPOINT}/auth/me`

export async function GET() {
  const response = await ApiProxy.get(DJANGO_API_ME_URL, true)

  return NextResponse.json(
    response.data,
    { status: response.status }
  )
}
