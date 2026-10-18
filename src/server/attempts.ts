import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { invariant } from "@/lib/errors";
import { createAuditLog } from "@/lib/audit";
import { stableShuffle, validateAvailability, validateAttemptLimit, gradeAnswer, totals } from "@/lib/assessment";
import { token } from "@/lib/security";
import { answerSchema } from "@/lib/validation";
import { z } from "zod";
type Tx = Prisma.TransactionClient;
const attemptInclude = {questions:{orderBy:{position:"asc" as const},include:{answer:{include:{options:true,grade:true}}}},exam:{include:{settings:true}},result:true} satisfies Prisma.ExamAttemptInclude;
export async function lockAttempt(tx:Tx,id:string) { await tx.$queryRaw`SELECT id FROM "ExamAttempt" WHERE id=${id} FOR UPDATE`; }
export async function startAttempt(studentId:string, examId:string) {
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Exam" WHERE id=${examId} FOR UPDATE`;
    const exam=await tx.exam.findUnique({where:{id:examId},include:{course:{include:{enrollments:{where:{studentId}}}},assignments:{where:{studentId}},questions:{orderBy:{position:"asc"},include:{question:{include:{options:true}}}}}});
    invariant(exam,404,"Exam not found.");
    invariant(exam.course.enrollments.length || exam.assignments.length,403,"You are not assigned to this exam.");
    const now=new Date(); validateAvailability(exam,now);
    const attempts=await tx.examAttempt.findMany({where:{examId,studentId},orderBy:{attemptNumber:"desc"}});
    const active=attempts.find(a=>a.status==="IN_PROGRESS");
    if(active) {
      if(active.expiresAt<=now) { await finalize(tx,active.id,true); return {id:active.id,expired:true}; }
      invariant(exam.allowResume,409,"Resume is disabled. Contact your instructor."); return {id:active.id};
    }
    validateAttemptLimit(attempts.length,exam.maxAttempts);
    invariant(exam.questions.length,409,"This exam has no questions.");
    const seed=token(); const ordered=exam.randomizeQuestions?stableShuffle(exam.questions,seed):exam.questions;
    const attempt=await tx.examAttempt.create({data:{examId,studentId,attemptNumber:attempts.length+1,seed,expiresAt:new Date(Math.min(now.getTime()+exam.durationSeconds*1000,exam.endAt.getTime())),questions:{create:ordered.map((eq,position)=>{
      const q=eq.question; const options=exam.randomizeOptions?stableShuffle(q.options,seed+q.id):q.options;
      return {originalQuestionId:q.id,position,type:q.type,text:q.text,explanation:q.explanation,points:eq.points,options:options.map(o=>({id:o.id,text:o.text})),correctOptionIds:q.options.filter(o=>o.isCorrect).map(o=>o.id),correctText:q.correctText};
    })}}});
    await createAuditLog(studentId,"ATTEMPT_STARTED","ExamAttempt",attempt.id,{},tx);
    return {id:attempt.id};
  },{timeout:20000});
}
export async function finalize(tx:Tx,id:string,automatic:boolean) {
  const a=await tx.examAttempt.findUnique({where:{id},include:attemptInclude});
  invariant(a,404,"Attempt not found."); if(a.status!=="IN_PROGRESS") return a;
  let pending=false; const scores:number[]=[];
  for(const q of a.questions) {
    const answer=q.answer || await tx.answer.create({data:{attemptQuestionId:q.id}});
    const points=gradeAnswer({type:q.type,points:Number(q.points),correctOptionIds:q.correctOptionIds,correctText:q.correctText},{text:answer.text,optionIds:q.answer?.options.map(o=>o.optionId)||[]});
    if(points===null) { pending=true; continue; }
    scores.push(points);
    await tx.grade.upsert({where:{answerId:answer.id},create:{answerId:answer.id,points},update:{points}});
  }
  const result=totals(scores,a.questions.reduce((s,q)=>s+Number(q.points),0),a.exam.passingScore);
  await tx.examAttempt.update({where:{id},data:{...result,status:pending?(automatic?"AUTO_SUBMITTED":"SUBMITTED"):"GRADED",submittedAt:automatic?a.expiresAt:new Date(),result:{create:{releasedAt:!pending&&a.exam.showResultsImmediately?new Date():null,finalizedAt:pending?null:new Date()}}}});
  await tx.antiCheatEvent.create({data:{attemptId:id,studentId:a.studentId,eventType:automatic?"AUTO_SUBMIT":"MANUAL_SUBMIT",severity:0}});
  await createAuditLog(a.studentId,automatic?"ATTEMPT_AUTO_SUBMITTED":"ATTEMPT_SUBMITTED","ExamAttempt",id,{},tx);
  return tx.examAttempt.findUniqueOrThrow({where:{id},include:attemptInclude});
}
export async function submitAttempt(studentId:string,id:string) {
  return db.$transaction(async tx=>{
    await lockAttempt(tx,id); const a=await tx.examAttempt.findUnique({where:{id}});
    invariant(a,404,"Attempt not found."); invariant(a.studentId===studentId,403,"This attempt belongs to another student.");
    const result=await finalize(tx,id,a.expiresAt<=new Date()); return {id:result.id,status:result.status};
  },{timeout:20000});
}
export async function saveAnswer(studentId:string,id:string,input:z.infer<typeof answerSchema>) {
  const result=await db.$transaction(async tx=>{
    await lockAttempt(tx,id); const a=await tx.examAttempt.findUnique({where:{id}});
    invariant(a,404,"Attempt not found."); invariant(a.studentId===studentId,403,"This attempt belongs to another student.");
    invariant(a.status==="IN_PROGRESS",409,"This attempt has already been submitted.");
    if(a.expiresAt<=new Date()) { await finalize(tx,id,true); return {expired:true}; }
    const q=await tx.attemptQuestion.findFirst({where:{id:input.questionId,attemptId:id},include:{answer:true}});
    invariant(q,400,"Question is not part of this attempt.");
    const options=q.options as {id:string;text:string}[];
    invariant(new Set(input.optionIds).size===input.optionIds.length && input.optionIds.every(v=>options.some(o=>o.id===v)),400,"Invalid answer option.");
    invariant(q.type==="MULTIPLE_CHOICE" || input.optionIds.length<=1,400,"Select only one option.");
    invariant(!["SHORT_ANSWER","ESSAY"].includes(q.type) || input.optionIds.length===0,400,"This question accepts text only.");
    invariant(["SHORT_ANSWER","ESSAY"].includes(q.type) || input.text==="",400,"This question accepts options only.");
    if(q.answer && input.revision<=q.answer.revision) return {saved:true,revision:q.answer.revision,stale:true};
    await tx.answer.upsert({where:{attemptQuestionId:q.id},create:{attemptQuestionId:q.id,text:input.text,revision:input.revision,options:{create:input.optionIds.map(optionId=>({optionId}))}},update:{text:input.text,revision:input.revision,options:{deleteMany:{},create:input.optionIds.map(optionId=>({optionId}))}}});
    if(input.flagged!==undefined) await tx.attemptQuestion.update({where:{id:q.id},data:{flagged:input.flagged}});
    await tx.examAttempt.update({where:{id},data:{lastActivityAt:new Date()}});
    return {saved:true,revision:input.revision};
  },{timeout:20000});
  invariant(!("expired" in result),409,"Time has expired. Your saved answers have been submitted."); return result;
}
export async function fetchAttempt(user:{id:string;role:string},id:string) {
  let a=await db.examAttempt.findUnique({where:{id},include:attemptInclude}); invariant(a,404,"Attempt not found.");
  invariant(user.role==="ADMIN" || (user.role==="INSTRUCTOR" ? a.exam.instructorId===user.id : a.studentId===user.id),403,"You cannot access this attempt.");
  if(a.status==="IN_PROGRESS" && a.expiresAt<=new Date()) {
    await db.$transaction(async tx=>{await lockAttempt(tx,id);await finalize(tx,id,true);},{timeout:20000});
    a=await db.examAttempt.findUniqueOrThrow({where:{id},include:attemptInclude});
  }
  const staff=user.role!=="STUDENT"; const released=!!a.result?.releasedAt && a.status!=="IN_PROGRESS";
  return {
    id:a.id,examId:a.examId,title:a.exam.title,instructions:a.exam.instructions,status:a.status,startedAt:a.startedAt,expiresAt:a.expiresAt,submittedAt:a.submittedAt,serverTime:new Date(),integrityEnabled:a.exam.settings?.integrityEnabled??true,requireFullscreen:a.exam.requireFullscreen,
    score:staff||released?a.score:null,percentage:staff||released?a.percentage:null,passed:staff||released?a.passed:null,released,
    questions:a.questions.map(q=>({id:q.id,position:q.position,type:q.type,text:q.text,points:q.points,options:q.options,flagged:q.flagged,answer:q.answer?{text:q.answer.text,optionIds:q.answer.options.map(o=>o.optionId),revision:q.answer.revision,grade:staff||released?q.answer.grade:null}:null,...(staff||(released&&a.exam.showCorrectAnswers)?{correctOptionIds:q.correctOptionIds,correctText:q.correctText,explanation:q.explanation}:{})})),
  };
}
export async function expireAttempts() {
  const due=await db.examAttempt.findMany({where:{status:"IN_PROGRESS",expiresAt:{lte:new Date()}},select:{id:true},take:100});
  for(const a of due) await db.$transaction(async tx=>{await lockAttempt(tx,a.id);await finalize(tx,a.id,true);},{timeout:20000});
  return due.length;
}
