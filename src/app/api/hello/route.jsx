import { NextResponse } from "next/server";
import { DJANGO_API_ENDPOINT } from "@/config/defaults";

const DJANG_API_QUESTIONS_URL = `${DJANGO_API_ENDPOINT}/questions/`

export async function GET(request) {
    const data = {apiEndpoint: DJANGO_API_ENDPOINT}
    return NextResponse.json(data, {status: 200})
}