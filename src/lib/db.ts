import { PrismaClient } from "@prisma/client";
const globalDb = globalThis as unknown as { db: PrismaClient };
export const db = globalDb.db || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.db = db;
