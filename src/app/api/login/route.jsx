"use server"
import { DJANGO_API_ENDPOINT } from '@/config/defaults'
import { setRefreshToken, setToken } from '@/lib/auth'
import { NextResponse } from 'next/server'

const DJANGO_API_LOGIN_URL = `${DJANGO_API_ENDPOINT}/token/pair`

export async function POST(request){

    const requestData = await request.json()
    const jsonData = JSON.stringify(requestData)
    const requestOptions = {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: jsonData
    }
    const response = await fetch(DJANGO_API_LOGIN_URL, requestOptions)

    const text = await response.text()
    let responseData = {}

    try {
        responseData = text ? JSON.parse(text) : {}
    } catch {
        responseData = {
            detail: "Backend returned a non-JSON response.",
            raw: text,
        }
    }

    if (response.ok){
        console.log("logged in")
        const {username, access, refresh} = responseData
        await setToken(access)
        await setRefreshToken(refresh)
        return NextResponse.json({"loggedIn": true, "username": username}, {status: 200})
    }

    //const cookieStore = await cookies()
    //const authToken = cookieStore.get("auth-token")

    return NextResponse.json(
        {"loggedIn": false, ... responseData},
        {status: response.status || 400}
    )
}
