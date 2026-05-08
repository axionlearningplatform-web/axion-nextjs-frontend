"use client"
import { useAuth } from "@/components/authProvider";
import { ThemeToggleButton } from "@/components/ui/themeToggleButton";
import Image from "next/image";
import {useState} from 'react';
import useSWR from 'swr';
import Questions from "./questions/forms";

const fetcher = (...args) => fetch(...args).then(res => res.json())

export default function Home() {
  const auth = useAuth()
  const {data, error, isLoading} = useSWR("/api/hello", fetcher)
  if (error) return <div>failed to load</div>
  if (isLoading) return <div>loading...</div>


  return (
    <main className="min-h-screen bg-muted p-6 md:p-10">
         {<Questions/>}
     </main>
  );
}
