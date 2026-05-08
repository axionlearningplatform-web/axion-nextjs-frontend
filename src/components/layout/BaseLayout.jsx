"use client"

import AppShell from "./AppShell"


export default function BaseLayout({ children }) {
  return (
    <AppShell>
      {children}
    </AppShell>
  )
}
