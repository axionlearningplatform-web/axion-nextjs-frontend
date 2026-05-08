"use client"

import { CircleUser } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "../authProvider"
import { useRouter } from "next/navigation"

export default function AccountDropdown({ className }) {
    const auth = useAuth()
    const router = useRouter()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-secondary hover:bg-secondary/80 transition-all outline-none">
                <CircleUser className="h-5 w-5" />
                <span className="sr-only">Toggle user menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                    <DropdownMenuLabel>
                        {auth.username ? auth.username : "Account"}
                    </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => router.push('/logout')}>
                        Logout
                    </DropdownMenuItem>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}