"use client"
import QuestionTable from './table';

export default function Page() {
  return (
    <main className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <QuestionTable/>
    </main>
  );
}
