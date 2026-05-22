import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"
import ApiProxy from "../../proxy"

const DJANGO_API_FAVOURITES_URL = `${DJANGO_API_ENDPOINT}/questions/favourites/`

export async function GET(request) {
  const { search } = new URL(request.url)
  const response = await ApiProxy.get(`${DJANGO_API_FAVOURITES_URL}${search}`, true)

  return NextResponse.json(response.data, { status: response.status })
}

export async function POST(request) {
  const requestData = await request.json()
  const response = await ApiProxy.post(DJANGO_API_FAVOURITES_URL, requestData, true)

  return NextResponse.json(response.data, { status: response.status })
}
