import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "ExamGuard · Secure assessments, clear outcomes",
    template: "%s · ExamGuard",
  },
  description:
    "A privacy-conscious examination platform for educators and students.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('examguard-theme');document.documentElement.classList.toggle('dark',t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))}catch{}`,
          }}
        />
      </head>
      <body>
        <a href="#main-content" className="skip">
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
