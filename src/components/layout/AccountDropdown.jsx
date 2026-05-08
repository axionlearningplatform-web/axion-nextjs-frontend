"use client"

import { CircleUser, Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
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
    const { setTheme } = useTheme()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex size-9 items-center justify-center rounded-full border border-[#54433c]/50 bg-[#201f1f] text-[#dac1b7] hover:text-[#ffb595] transition-all outline-none">
                <CircleUser className="h-5 w-5" />
                <span className="sr-only">Toggle user menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48 border-[#54433c]/50 bg-[#151515] text-[#e5e2e1]">
                <DropdownMenuGroup>
                    <DropdownMenuLabel>
                        {auth.username ? auth.username : "Account"}
                        {auth.activeRole && (
                            <span className="block text-xs font-normal capitalize text-muted-foreground">
                                {auth.activeRole.replaceAll("_", " ")}
                            </span>
                        )}
                    </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuItem disabled className="opacity-35">
                        <Sun className="mr-2 size-4" />
                        Light
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("dark")}>
                        <Moon className="mr-2 size-4" />
                        Dark
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("system")}>
                        <Monitor className="mr-2 size-4" />
                        System
                    </DropdownMenuItem>
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
