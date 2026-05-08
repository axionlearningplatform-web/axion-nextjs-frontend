import { cookies } from "next/headers"

const TOKEN_AGE = 3600
const TOKEN_NAME = "auth-token"
const TOKEN_REFRESH_NAME = "auth-refresh-token"

export async function getToken(){
    //api requests
    const cookie = await cookies()
    const myAuthToken = cookie.get(TOKEN_NAME)
    return myAuthToken?.value
}

export async function getRefershToken(){
    //api requests
    const cookie = await cookies()
    const myAuthToken = cookie.get(TOKEN_REFRESH_NAME)
    return myAuthToken?.value
}

export async function setToken(authToken){
    //login
    const cookie = await cookies()
    return cookie.set({
        name: TOKEN_NAME,
        value: authToken,
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV !== 'development',
        maxAge: TOKEN_AGE,
    })
}

export async function setRefreshToken(authRefreshToken){
    //login
    const cookie = await cookies()
    return cookie.set({
        name: TOKEN_REFRESH_NAME,
        value: authRefreshToken,
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV !== 'development',
        maxAge: TOKEN_AGE,
    })
}

export async function deleteToken(){
    //logout
    const cookie = await cookies()
    cookie.delete(TOKEN_REFRESH_NAME)
    return cookie.delete(TOKEN_NAME)
}