import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get("auth-token");

  redirect(authToken ? "/dashboard" : "/login");
}
