"use client"
import { useAuth } from "@/components/authProvider"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import fetcher from "@/lib/fetcher"
import { useParams, useRouter } from "next/navigation"
import { useEffect } from "react"
import useSWR from "swr"

const QUESTIONS_API_URL = "/api/questions/"


export default function QuestionTable() {
    const router = useRouter()
    const params = useParams()
    const subjectSlug = params?.slug
    const {
        data: subjects = [],
        isLoading: subjectsLoading,
    } = useSWR("/api/subjects/", fetcher)
    const lockedSubject = subjects.find(
        (subject) => subject.slug === subjectSlug
    )
    const questionsUrl = subjectSlug
        ? lockedSubject
            ? `${QUESTIONS_API_URL}?subject_id=${lockedSubject.id}`
            : null
        : QUESTIONS_API_URL
    const {data, error, isLoading} = useSWR(questionsUrl, fetcher)
    const auth = useAuth()
    useEffect(()=> {
        if(error?.status === 401){
            auth.loginRequiredRedirect()
        }
    }, [auth, error])
    if(error) return <div className="p-10 text-[#ffb4ab]">Failed to load questions</div>
    if(subjectSlug && !subjectsLoading && !lockedSubject) {
        return <div className="p-10 text-[#ffb4ab]">Subject not available for this user</div>
    }
    if(subjectsLoading || isLoading) return <div className="p-10 text-[#dac1b7]">Loading questions...</div>
  return (
  <div className="mx-auto w-full max-w-7xl px-8 py-10">
    <div className="mb-8">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#ffb595]">
        {lockedSubject?.name || "Question Database"}
      </p>
      <h1 className="mt-2 text-3xl font-bold text-[#e5e2e1]">
        Question Database
      </h1>
    </div>

    <div className="rounded-2xl border border-[#3b2a22]/55 bg-[#1b1713]/90 p-3">
    <Table className="border-separate border-spacing-y-2">
      <TableHeader className="[&_tr]:border-0">
        <TableRow className="border-0 hover:bg-transparent">
          <TableHead className="w-20 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">ID</TableHead>
          <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">Question</TableHead>
          <TableHead className="w-48 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">Source</TableHead>
          <TableHead className="w-52 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">Topics</TableHead>
          <TableHead className="w-36 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">Creator</TableHead>
          <TableHead className="w-24 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">Marks</TableHead>
          <TableHead className="w-36 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.map((item) => (
        <TableRow
            key={item.id}
            className="cursor-pointer border-0 bg-[#181410] text-[#e5e2e1] shadow-sm transition-colors hover:bg-[#211913] [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl"
            onClick={() => router.push(lockedSubject ? `/subjects/${lockedSubject.slug}/questions/${item.id}` : `/questions/${item.id}`)}
        >
            <TableCell className="px-4 font-semibold text-[#ffb595]">{item.id}</TableCell>
            <TableCell className="max-w-[520px] px-4">
                <div className="overflow-hidden text-ellipsis line-clamp-3 break-words">
                {item.question_text}
            </div>
            </TableCell>
            <TableCell className="max-w-48 px-4 text-[#dac1b7]">
              <div className="line-clamp-2 whitespace-normal break-words">
                {item.import_source || "Manual"}
              </div>
            </TableCell>
            <TableCell className="px-4">
              <div className="flex max-w-52 flex-wrap gap-1.5">
                {(item.tags || []).slice(0, 3).map((tag) => (
                  <span
                    className="rounded-full border border-[#3b2a22]/60 bg-[#211913] px-2 py-1 text-[11px] text-[#dac1b7]"
                    key={tag.id}
                  >
                    {tag.name}
                  </span>
                ))}
                {(item.tags || []).length > 3 && (
                  <span className="rounded-full border border-[#3b2a22]/55 bg-white/[0.035] px-2 py-1 text-[11px] text-[#a28c83]">
                    +{item.tags.length - 3}
                  </span>
                )}
                {(item.tags || []).length === 0 && (
                  <span className="text-xs text-[#6f5c55]">Untagged</span>
                )}
              </div>
            </TableCell>
            <TableCell className="max-w-36 px-4 text-[#dac1b7]">
              <div className="line-clamp-1 whitespace-normal break-words">
                {item.creator_name || "Unknown"}
              </div>
            </TableCell>
            <TableCell className="px-4">{item.marks}</TableCell>
            <TableCell className="px-4 text-[#dac1b7]">
                {new Date(item.created_at).toLocaleDateString()}
            </TableCell>
        </TableRow>
        ))}
     </TableBody>
    </Table>
    {data?.length === 0 && (
      <div className="px-4 py-10 text-center text-sm text-[#a28c83]">
        No questions in this subject yet.
      </div>
    )}
    </div>
  </div>
  )
}
