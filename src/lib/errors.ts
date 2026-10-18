import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function invariant(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new AppError(status, message);
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return Response.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  const id = randomUUID();
  console.error(
    JSON.stringify({
      level: "error",
      errorId: id,
      type: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return Response.json(
    { error: "Something went wrong. Please try again.", errorId: id },
    { status: 500 },
  );
}
