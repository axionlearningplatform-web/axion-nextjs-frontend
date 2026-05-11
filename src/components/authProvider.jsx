"use client"
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";


const AuthContext = createContext(null);

const LOGIN_REDIRECT_URL = "/dashboard"
const LOGOUT_REDIRECT_URL = "/login"
const LOGIN_REQUIRED_URL = "/login"
const ME_URL = "/api/me"


export function AuthProvider({children}){
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [username, setUsername] = useState("")
    const [user, setUser] = useState(null)
    const [memberships, setMemberships] = useState([])
    const [subjectMemberships, setSubjectMemberships] = useState([])
    const [activeRole, setActiveRole] = useState(null)
    const [permissions, setPermissions] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const applyUserContext = (context) => {
        setUser(context)
        setUsername(context?.display_name || context?.username || "")
        setMemberships(context?.memberships || [])
        setSubjectMemberships(context?.subject_memberships || [])
        setActiveRole(context?.active_role || null)
        setPermissions(context?.permissions || [])
        setIsAuthenticated(Boolean(context?.is_authenticated))
    }

    const clearUserContext = () => {
        setUser(null)
        setUsername("")
        setMemberships([])
        setSubjectMemberships([])
        setActiveRole(null)
        setPermissions([])
        setIsAuthenticated(false)
    }

    const refreshUser = async () => {
        setIsLoading(true)
        try {
            const response = await fetch(ME_URL, {
                cache: "no-store",
            })
            if (!response.ok) {
                clearUserContext()
                return null
            }
            const data = await response.json()
            applyUserContext(data)
            return data
        } catch {
            clearUserContext()
            return null
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() =>{
        // eslint-disable-next-line react-hooks/set-state-in-effect
        refreshUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const login = async (nextOverride = null) => {
        await refreshUser()
        const nextUrl = nextOverride || searchParams.get("next")
        const invalidNextUrl = ['/login', '/logout']
        const nextUrlValid =
            nextUrl &&
            nextUrl.startsWith("/") &&
            !nextUrl.startsWith("//") &&
            !invalidNextUrl.some((url) => nextUrl === url || nextUrl.startsWith(`${url}?`))
        router.replace(nextUrlValid ? nextUrl : LOGIN_REDIRECT_URL)
        router.refresh()
    }
    const logout = () => {
        clearUserContext()
        router.replace(LOGOUT_REDIRECT_URL)
    }
    const loginRequiredRedirect = () => {
        //user is not logged in via API
        clearUserContext()
        let loginWithNextURL = `${LOGIN_REQUIRED_URL}?next=${pathname}`
        if(LOGIN_REQUIRED_URL === pathname){
            loginWithNextURL = `${LOGIN_REQUIRED_URL}`
        }
        router.replace(loginWithNextURL)
    }
    const can = (permission) => permissions.includes(permission)

    return <AuthContext.Provider value = {{
        isAuthenticated,
        isLoading,
        login,
        logout,
        loginRequiredRedirect,
        refreshUser,
        username,
        user,
        memberships,
        subjectMemberships,
        activeRole,
        permissions,
        can,
    }}>
        {children}
    </AuthContext.Provider>
}


export function useAuth(){
    return useContext(AuthContext)
}
