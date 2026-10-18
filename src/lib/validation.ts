import { z } from "zod";
export const passwordSchema = z.string().min(12,"Use at least 12 characters").max(72,"Use at most 72 characters").refine(v => Buffer.byteLength(v,"utf8") <= 72,"Password must be at most 72 UTF-8 bytes");
export const loginSchema = z.object({ email: z.email().transform(v => v.toLowerCase().trim()), password: z.string().min(1).max(200) }).strict();
export const registrationSchema = loginSchema.extend({ name: z.string().trim().min(2).max(100), password: passwordSchema });
export const questionSchema = z.object({
  questionBankId: z.string().min(1), type: z.enum(["SINGLE_CHOICE","MULTIPLE_CHOICE","TRUE_FALSE","SHORT_ANSWER","ESSAY"]), text: z.string().trim().min(5).max(10000), explanation: z.string().max(10000).default(""),
  difficulty: z.enum(["EASY","MEDIUM","HARD"]).default("MEDIUM"), topic: z.string().max(100).default(""), points: z.coerce.number().min(0.01).max(1000), tags: z.array(z.string().max(40)).max(20).default([]), correctText: z.string().max(2000).nullable().optional(),
  options: z.array(z.object({ text: z.string().trim().min(1).max(2000), isCorrect: z.boolean() }).strict()).max(10).default([]),
}).strict().superRefine((q,ctx) => {
  if (["SINGLE_CHOICE","MULTIPLE_CHOICE","TRUE_FALSE"].includes(q.type)) {
    const count = q.options.filter(o => o.isCorrect).length;
    if(q.options.length < 2 || count < 1 || (q.type !== "MULTIPLE_CHOICE" && count !== 1) || (q.type === "TRUE_FALSE" && q.options.length !== 2)) ctx.addIssue({code:"custom",message:"Choice questions need valid options and correct answers"});
  }
  if(q.type === "SHORT_ANSWER" && !q.correctText?.trim()) ctx.addIssue({code:"custom",message:"Short answer needs a reference answer"});
});
export const examSchema = z.object({
  title: z.string().trim().min(3).max(200), description: z.string().max(4000).default(""), instructions: z.string().max(10000).default(""), courseId: z.string().min(1),
  durationSeconds: z.coerce.number().int().min(60).max(86400), startAt: z.iso.datetime(), endAt: z.iso.datetime(), maxAttempts: z.coerce.number().int().min(1).max(10), passingScore: z.coerce.number().int().min(0).max(100),
  randomizeQuestions: z.boolean().default(true), randomizeOptions: z.boolean().default(true), showResultsImmediately: z.boolean().default(false), showCorrectAnswers: z.boolean().default(false), allowResume: z.boolean().default(true), requireFullscreen: z.boolean().default(false), integrityEnabled: z.boolean().default(true),
  questions: z.array(z.object({questionId:z.string(),points:z.coerce.number().min(0.01).max(1000)}).strict()).max(200).default([]),
}).strict().refine(v=>new Date(v.endAt)>new Date(v.startAt),"End time must be after start time").refine(v=>new Set(v.questions.map(q=>q.questionId)).size===v.questions.length,"Duplicate questions are not allowed");
export const answerSchema = z.object({questionId:z.string(),text:z.string().max(20000).default(""),optionIds:z.array(z.string()).max(10).default([]),revision:z.number().int().min(0),flagged:z.boolean().optional()}).strict();
export const eventSchema = z.object({eventType:z.enum(["TAB_HIDDEN","BLUR","FULLSCREEN_ENTER","FULLSCREEN_EXIT","COPY","PASTE","CUT","CONTEXT_MENU","REFRESH","OFFLINE","ONLINE","INACTIVITY","RAPID_CHANGES"])}).strict();
