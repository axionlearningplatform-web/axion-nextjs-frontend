import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { NextResponse } from "next/server"

const DJANGO_API_QUESTIONS_URL =
  `${DJANGO_API_ENDPOINT}/questions/`


// SAFE RESPONSE PARSER
async function parseResponse(response) {

  const text = await response.text()

  try {
    return JSON.parse(text)
  } catch {

    console.log("NON JSON RESPONSE:")
    console.log(text)

    return {
      error: "Backend returned non-JSON response",
      raw: text,
    }
  }
}


// GET SINGLE QUESTION
export async function GET(request, context) {

  try {

    const params = await context.params
    const lookupId = params.id

    const endpoint =
      `${DJANGO_API_QUESTIONS_URL}${lookupId}/`

    console.log("FETCHING:", endpoint)

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    const data = await parseResponse(response)

    console.log("DJANGO RESPONSE:", data)

    return NextResponse.json(data, {
      status: response.status,
    })

  } catch (error) {

    console.log("GET ERROR:", error)

    return NextResponse.json(
      {
        message: "Cannot reach API server",
        error: String(error),
      },
      { status: 500 }
    )
  }
}


// UPDATE QUESTION
export async function PATCH(request, context) {

  try {

    const params = await context.params
    const lookupId = params.id

    const body = await request.json()

    const endpoint =
      `${DJANGO_API_QUESTIONS_URL}${lookupId}/`

    console.log("PATCHING:", endpoint)

    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const data = await parseResponse(response)

    console.log("PATCH RESPONSE:", data)

    return NextResponse.json(data, {
      status: response.status,
    })

  } catch (error) {

    console.log("PATCH ERROR:", error)

    return NextResponse.json(
      {
        message: "Cannot reach API server",
        error: String(error),
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request,
  context
) {

  try {

    const params = await context.params

    const lookupId = params.id

    const endpoint =
      `${DJANGO_API_QUESTIONS_URL}${lookupId}/`

    console.log("DELETING:", endpoint)

    const response = await fetch(
      endpoint,
      {
        method: "DELETE",
      }
    )

    return NextResponse.json(
      {},
      {
        status: response.status,
      }
    )

  } catch (error) {

    console.log("DELETE ERROR:", error)

    return NextResponse.json(
      {
        message: "Delete failed",
      },
      {
        status: 500,
      }
    )
  }
}
