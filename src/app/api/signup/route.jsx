"use server"

import { DJANGO_API_ENDPOINT } from "@/config/defaults"
import { setRefreshToken, setToken } from "@/lib/auth"
import { NextResponse } from "next/server"

const DJANGO_API_SIGNUP_URL = `${DJANGO_API_ENDPOINT}/auth/signup`
const DJANGO_API_LOGIN_URL = `${DJANGO_API_ENDPOINT}/token/pair`

async function parseResponse(response) {
  const text = await response.text()

  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return {
      detail: "Backend returned a non-JSON response.",
      raw: text,
    }
  }
}

export async function POST(request) {
  const requestData = await request.json()

  const signupResponse = await fetch(DJANGO_API_SIGNUP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestData),
  })

  const signupData = await parseResponse(signupResponse)

  if (!signupResponse.ok) {
    return NextResponse.json(
      {
        signedUp: false,
        ...signupData,
      },
      { status: signupResponse.status || 400 }
    )
  }

  const loginResponse = await fetch(DJANGO_API_LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: requestData.username,
      password: requestData.password,
    }),
  })

  const loginData = await parseResponse(loginResponse)

  if (!loginResponse.ok) {
    return NextResponse.json(
      {
        signedUp: true,
        loggedIn: false,
        detail: "Account created, but automatic login failed.",
        login: loginData,
      },
      { status: loginResponse.status || 400 }
    )
  }

  await setToken(loginData.access)
  await setRefreshToken(loginData.refresh)

  return NextResponse.json(
    {
      signedUp: true,
      loggedIn: true,
      user: signupData,
    },
    { status: 200 }
  )
}
