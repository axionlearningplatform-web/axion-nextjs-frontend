"use client"

import FavouritesTable from "@/components/favourites/FavouritesTable"
import { useAuth } from "@/components/authProvider"
import { Loader2 } from "lucide-react"
import { useParams } from "next/navigation"

export default function SubjectFavouritesPage() {
  const params = useParams()
  const auth = useAuth()
  const membership = auth.subjectMemberships?.find(
    (item) => item.subject.slug === params.slug
  )
  const subject = membership?.subject

  if (auth.isLoading) {
    return (
      <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#16130f] text-[#8f8982]">
        <Loader2 className="size-8 animate-spin" />
      </main>
    )
  }

  if (!subject) {
    return <div className="p-10 text-[#ffb4ab]">Subject not available for this user</div>
  }

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#16130f] text-[#e5e2e1]">
      <div className="mx-auto w-full max-w-[1180px] px-8 py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#ffb595]">
            {subject.name}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-[#e5e2e1]">
            Favourites
          </h1>
        </div>
        <FavouritesTable subject={subject} />
      </div>
    </main>
  )
}
