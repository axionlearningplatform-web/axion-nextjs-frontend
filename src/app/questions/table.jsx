"use client"
import { useAuth } from "@/components/authProvider"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import fetcher from "@/lib/fetcher"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import useSWR from "swr"

const QUESTIONS_API_URL = "/api/questions/"


export default function QuestionTable() {
    const router = useRouter()
    const {data, error, isLoading} = useSWR(QUESTIONS_API_URL, fetcher)
    const auth = useAuth()
    useEffect(()=> {
        if(error?.status === 401){
            auth.loginRequiredRedirect()
        }
    }, [auth, error])
    if(error) return <div>failed to load</div>
    if(isLoading) return <div>loading...</div>
  return (
  <div className="flex justify-center">
    <div className="w-full max-w-7xl">
    <Table className="table-fixed border rounded-xl overflow-hidden">
      <TableHeader>
        <TableRow>
          <TableHead className="w-25 font-extrabold">ID</TableHead>
          <TableHead className="w-45 font-extrabold">Subject</TableHead>
          <TableHead className="w-100 font-extrabold">Question</TableHead>
          <TableHead className="w-30 font-extrabold">Marks</TableHead>
          <TableHead className="w-50 font-extrabold">Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item, idx) => (
        <TableRow
            key={item.id}
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => router.push(`/questions/${item.id}`)}
        >
            <TableCell>{item.id}</TableCell>
            <TableCell>{item.subject}</TableCell>
            <TableCell className="max-w-100">
                <div className="overflow-hidden text-ellipsis line-clamp-3 break-words">
                {item.question_text}
            </div>
            </TableCell>
            <TableCell>{item.marks}</TableCell>
            <TableCell>
                {new Date(item.created_at).toLocaleDateString()}
            </TableCell>
        </TableRow>
        ))}
     </TableBody>
    </Table>
    </div>
  </div>
  )
}
