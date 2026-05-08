

const NavLinks = [
    {
        label: "Create",
        authRequired: true,
        href: "/create",
        permission: "question:create",
    },
    {
        label: "Questions",
        authRequired: true,
        href: "/questions",
        permission: "question:read",
    }
]

export const NonUserLinks = [
    {
        label: "Signup",
        authRequired: false,
        href: "/signup"
    },
    {
        label: "Login",
        authRequired: false,
        href: "/login"
    }
]
export default NavLinks
