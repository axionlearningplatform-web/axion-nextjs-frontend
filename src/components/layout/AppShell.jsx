"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  CalendarDays,
  ChevronsUpDown,
  Database,
  Home,
  LibraryBig,
  Menu,
  PenSquare,
  Sparkles,
  Upload,
} from "lucide-react"

import AccountDropdown from "@/components/layout/AccountDropdown"
import { useAuth } from "@/components/authProvider"
import { cn } from "@/lib/utils"

const QUESTION_BANK_ROLES = ["head_coordinator", "teacher_analyst"]

const subjectIcons = {
  "mathematics-extension-2": "Σ",
  "mathematics-extension-1": "∫",
  "mathematics-advanced": "f",
  chemistry: "Ch",
  physics: "Φ",
  economics: "$",
}

function roleLabel(role) {
  return role ? role.replaceAll("_", " ") : ""
}

function getSubjectInitial(subject) {
  return subjectIcons[subject?.slug] || subject?.name?.slice(0, 2) || "Ax"
}

function getCurrentSubject(pathname, subjectMemberships) {
  const match = pathname.match(/^\/subjects\/([^/]+)/)
  const slug = match?.[1]
  const bySlug = subjectMemberships.find((item) => item.subject.slug === slug)

  return bySlug || subjectMemberships[0] || null
}

function NavItem({ href, icon: Icon, label, active, collapsed, disabled = false }) {
  const content = (
    <span
      className={cn(
        "flex h-11 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-[#4a2f26] text-[#ffb595]"
          : "text-[#dac1b7] hover:bg-[#201f1f] hover:text-[#e5e2e1]",
        disabled && "cursor-default opacity-55 hover:bg-transparent"
      )}
    >
      <Icon className="size-5 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </span>
  )

  if (disabled) return content

  return <Link href={href}>{content}</Link>
}

function SubjectSwitcher({ collapsed, currentSubject, subjectMemberships }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  if (!currentSubject) {
    return (
      <div className="border-t border-[#2a2118]/60 p-4">
        <div className="rounded-xl border border-[#54433c]/30 bg-[#1c1b1b] p-3 text-xs text-[#dac1b7]">
          No subjects assigned
        </div>
      </div>
    )
  }

  function chooseSubject(membership) {
    setOpen(false)
    router.push(`/subjects/${membership.subject.slug}`)
  }

  return (
    <div className="relative border-t border-[#2a2118]/60 p-4">
      {open && (
        <div
          className={cn(
            "absolute z-50 max-h-[360px] overflow-y-auto rounded-2xl border border-[#54433c]/60 bg-[#151515] p-3 shadow-2xl shadow-black/40",
            collapsed
              ? "bottom-4 left-[76px] w-[300px]"
              : "bottom-[88px] left-4 w-[300px]"
          )}
        >
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-[#a28c83]">
            Subjects
          </p>
          <div className="grid gap-1">
            {subjectMemberships.map((membership) => (
              <button
                key={membership.subject.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[#201f1f]",
                  currentSubject.subject.id === membership.subject.id &&
                    "bg-[#241b18] text-[#ffb595]"
                )}
                type="button"
                onClick={() => chooseSubject(membership)}
              >
                <span className="flex size-10 items-center justify-center rounded-xl border border-[#54433c]/50 bg-[#201f1f] text-sm font-bold text-[#ffb595]">
                  {getSubjectInitial(membership.subject)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[#e5e2e1]">
                    {membership.subject.name}
                  </span>
                  <span className="block truncate text-xs capitalize text-[#a28c83]">
                    {roleLabel(membership.role)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border border-transparent p-2 text-left transition-colors hover:border-[#54433c]/50 hover:bg-[#201f1f]",
          collapsed && "justify-center"
        )}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#54433c]/40 bg-[#2b201c] text-base font-bold text-[#ffb595]">
          {getSubjectInitial(currentSubject.subject)}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[#e5e2e1]">
                {currentSubject.subject.name}
              </span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-[#a28c83]">
                Year 12 HSC Syllabus
              </span>
            </span>
            <ChevronsUpDown className="size-5 text-[#dac1b7]" />
          </>
        )}
      </button>
    </div>
  )
}

export default function AppShell({ children }) {
  const auth = useAuth()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const publicPage = pathname === "/login" || pathname === "/signup"
  const subjectMemberships = useMemo(
    () => auth.subjectMemberships || [],
    [auth.subjectMemberships]
  )
  const currentSubject = useMemo(
    () => getCurrentSubject(pathname, subjectMemberships),
    [pathname, subjectMemberships]
  )
  const canUseQuestionBank =
    currentSubject && QUESTION_BANK_ROLES.includes(currentSubject.role)
  const subjectBase = currentSubject
    ? `/subjects/${currentSubject.subject.slug}`
    : "/dashboard"

  useEffect(() => {
    if (
      auth.isAuthenticated &&
      !auth.isLoading &&
      pathname === "/dashboard" &&
      currentSubject
    ) {
      return
    }
  }, [auth.isAuthenticated, auth.isLoading, currentSubject, pathname])

  if (publicPage) {
    return (
      <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
        <TopBar publicPage collapsed={false} />
        <main className="pt-16">{children}</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-[#2a2118]/60 bg-[#131110] transition-all duration-200",
          collapsed ? "w-[88px]" : "w-[280px]"
        )}
      >
        <div className={cn("flex h-16 items-center gap-3 px-4", collapsed && "justify-center")}>
          <button
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#54433c]/40 bg-[#201f1f] text-[#ffb595] transition-colors hover:bg-[#2a211e] active:scale-95"
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <Menu className="size-5" /> : <LibraryBig className="size-5" />}
          </button>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold capitalize text-[#e5e2e1]">
                {currentSubject ? roleLabel(currentSubject.role) : "No subject"}
              </p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[#a28c83]">
                Current Access
              </p>
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 pt-4">
          <NavItem
            href={subjectBase}
            icon={Home}
            label="Home"
            active={pathname === subjectBase || pathname === "/dashboard"}
            collapsed={collapsed}
            disabled={!currentSubject}
          />
          {!collapsed && <div className="mx-4 my-2 h-px max-w-[210px] bg-[#54433c]/40" />}
          <NavItem
            href={`${subjectBase}/practice`}
            icon={CalendarDays}
            label="Daily Practice"
            active={pathname === `${subjectBase}/practice`}
            collapsed={collapsed}
            disabled={!currentSubject}
          />
          <NavItem
            href={subjectBase}
            icon={Sparkles}
            label="Development"
            active={false}
            collapsed={collapsed}
            disabled
          />
          <NavItem
            href={subjectBase}
            icon={BarChart3}
            label="Progress"
            active={false}
            collapsed={collapsed}
            disabled
          />

          {canUseQuestionBank && (
            <div className="mt-6 grid gap-1">
              {!collapsed && (
                <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#a28c83]">
                  Admin Area
                </p>
              )}
              <NavItem
                href={`${subjectBase}/create`}
                icon={PenSquare}
                label="Creator"
                active={pathname === `${subjectBase}/create`}
                collapsed={collapsed}
              />
              <NavItem
                href={`${subjectBase}/scrape`}
                icon={Upload}
                label="Scrape"
                active={pathname === `${subjectBase}/scrape`}
                collapsed={collapsed}
              />
              <NavItem
                href={`${subjectBase}/questions`}
                icon={Database}
                label="Database"
                active={pathname.startsWith(`${subjectBase}/questions`)}
                collapsed={collapsed}
              />
            </div>
          )}
        </nav>

        <SubjectSwitcher
          collapsed={collapsed}
          currentSubject={currentSubject}
          subjectMemberships={subjectMemberships}
        />
      </aside>

      <div
        className={cn(
          "min-h-screen transition-[padding] duration-200",
          collapsed ? "pl-[88px]" : "pl-[280px]"
        )}
      >
        <TopBar collapsed={collapsed} />
        <main className="min-h-[calc(100vh-64px)] pt-16">{children}</main>
      </div>
    </div>
  )
}

function TopBar({ publicPage = false, collapsed }) {
  const auth = useAuth()

  return (
    <header
      className={cn(
        "fixed right-0 top-0 z-40 flex h-16 items-center justify-center border-b border-[#2a2118]/60 bg-[#131110] px-8 backdrop-blur",
        publicPage ? "left-0" : collapsed ? "left-[88px]" : "left-[280px]"
      )}
    >
      <Link
        href="/dashboard"
        className="bg-gradient-to-r from-[#e5e2e1] via-[#ffdbc9] to-[#ffb595] bg-[length:180%_100%] bg-clip-text font-serif text-xl font-semibold tracking-wide text-transparent transition-all duration-500 [background-position:0_0] hover:[background-position:100%_0]"
      >
        Axion
      </Link>

      <div className="absolute right-8 flex items-center gap-4">
        {auth.isAuthenticated ? (
          <AccountDropdown />
        ) : (
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link className="text-[#dac1b7] hover:text-[#ffb595]" href="/login">
              Login
            </Link>
            <Link
              className="rounded-full bg-[#ffb595] px-4 py-2 text-[#351000] hover:bg-[#ffdbc9]"
              href="/signup"
            >
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
