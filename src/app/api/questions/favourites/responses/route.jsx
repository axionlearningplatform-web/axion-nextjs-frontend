import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"
import ApiProxy from "../../../proxy"

const DJANGO_API_FAVOURITE_RESPONSES_URL = `${DJANGO_API_ENDPOINT}/questions/favourites/responses/`

export async function POST(request) {
  const requestData = await request.json()
  const response = await ApiProxy.post(DJANGO_API_FAVOURITE_RESPONSES_URL, requestData, true)

  return NextResponse.json(response.data, { status: response.status })
}
