import { Prisma } from "@prisma/client";
import { db } from "./db";
export function createAuditLog(actorId: string | null, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject = {}, client: Prisma.TransactionClient = db) {
  console.info(JSON.stringify({ level: "info", action, entityType, entityId }));
  return client.auditLog.create({ data: { actorId, action, entityType, entityId, metadata } });
}
