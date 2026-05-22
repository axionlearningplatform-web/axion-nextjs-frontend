import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"
import ApiProxy from "../../../proxy"

const DJANGO_API_FAVOURITES_URL = `${DJANGO_API_ENDPOINT}/questions/favourites/`

export async function DELETE(request, context) {
  const params = await context.params
  const response = await ApiProxy.delete(
    `${DJANGO_API_FAVOURITES_URL}${params.questionId}/`,
    true
  )

  return NextResponse.json(response.data, { status: response.status })
}
