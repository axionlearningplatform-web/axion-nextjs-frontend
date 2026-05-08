"use client"
import Questions from "./questions/forms";

export default function Home() {

  return (
    <main className="min-h-screen bg-muted p-6 md:p-10">
      {<Questions/>}
     </main>
  );
}
