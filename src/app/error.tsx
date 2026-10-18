"use client";
import { Failure } from "@/components/ui";
export default function ErrorPage({reset}:{reset:()=>void}){return <main id="main-content" className="legal"><Failure message="An unexpected error occurred. Please retry or contact your administrator." retry={reset}/></main>}
