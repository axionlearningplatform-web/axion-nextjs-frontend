import { NextResponse } from "next/server";
import ApiProxy from "../../../proxy";
import { DJANGO_API_ENDPOINT } from "@/config/defaults";

const DJANGO_TIKZ_PREVIEW_URL =
  `${DJANGO_API_ENDPOINT}/questions/tikz/preview/`;

export async function POST(request) {
  const requestData = await request.json();

  const response = await ApiProxy.post(
    DJANGO_TIKZ_PREVIEW_URL,
    requestData,
    true // authenticated
  );

  return NextResponse.json(
    response.data,
    {
      status: response.status,
    }
  );
}