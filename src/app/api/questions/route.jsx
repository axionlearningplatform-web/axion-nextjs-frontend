import { getToken } from "@/lib/auth";
import { NextResponse } from "next/server";
import ApiProxy from "../proxy";
import { DJANGO_API_ENDPOINT } from "@/config/defaults";

const DJANG_API_QUESTIONS_URL = `${DJANGO_API_ENDPOINT}/questions/`

export async function GET(request) {
    const response = await ApiProxy.get(
        DJANG_API_QUESTIONS_URL,
        true
    )
    console.log(response)

    return NextResponse.json(
        response.data,
        { status: response.status }
    )
}

export async function POST(request){
    const requestData = await request.json()
    const response = await ApiProxy.post(
        DJANG_API_QUESTIONS_URL,
        requestData,
        true
    )

    if (response.status >= 200 && response.status < 300){
        console.log("saved question")
        return NextResponse.json(
            response.data,
            { status: response.status }
        )
    }

    return NextResponse.json(
        response.data,
        { status: response.status }
    )
}