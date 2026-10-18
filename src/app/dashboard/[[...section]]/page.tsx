import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { Workspace } from "@/components/workspace";
export async function generateMetadata({params}:{params:Promise<{section?:string[]}>}){const {section}=await params;return {title:section?.[0]?section[0].charAt(0).toUpperCase()+section[0].slice(1):"Overview"};}
export default async function DashboardPage({params}:{params:Promise<{section?:string[]}>}){const user=await currentUser();if(!user)redirect("/login");const {section=[]}=await params;return <Shell user={user}><Workspace user={user} section={section}/></Shell>}
