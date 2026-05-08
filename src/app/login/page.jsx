"use client"

import { GalleryVerticalEnd } from "lucide-react"
import { LoginForm } from "@/components/login-form"
import { useAuth } from "@/components/authProvider"

// -> url -> /login

const LOGIN_URL = "/api/login/"

export default function Page() {
  const auth = useAuth()
    
  async function handleSubmit(event){
    event.preventDefault()
    const formData = new FormData(event.target)
    // const username = formData.get('username')
    // const password = formData.get('password')

    const objectFromForm = Object.fromEntries(formData)
    const jsonData = JSON.stringify(objectFromForm)
    const requestOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
       },
    body: jsonData
   }
   const response = await fetch(LOGIN_URL, requestOptions)
   let data = {}
   try{
      data = await response.json()
   } catch(error){

   }
    if (response.ok) {
     console.log("logged in")
      auth.login(data?.username)
     } 
    }


  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="#" className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GalleryVerticalEnd className="size-4" />
          </div>
          Axion Learning
        </a>
        <LoginForm onSubmit={handleSubmit} />
      </div>
    </div>
  )
}
