import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ExamRunner } from "@/components/exam-runner";
export const metadata = { title: "Timed examination" };
export default async function ExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  return <ExamRunner id={id} />;
}
