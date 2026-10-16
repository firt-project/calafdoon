import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

/**
 * Turns database errors caused by hostile or malformed input into clean 4xx responses
 * (invalid UUID in a URL, NUL bytes in text, missing rows), instead of a 500 with an
 * error in the logs. Anything unrecognised is still a 500 with no detail leaked.
 */
export function mapPrismaError(
  err: unknown
): { status: number; message: string } | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2023": // malformed identifier (e.g. not a UUID)
        return { status: HttpStatus.BAD_REQUEST, message: "Invalid identifier" };
      case "P2025": // record required but not found
        return { status: HttpStatus.NOT_FOUND, message: "Not found" };
      case "P2002": // unique constraint
        return { status: HttpStatus.CONFLICT, message: "Already exists" };
      case "P2000": // value too long for the column
        return { status: HttpStatus.BAD_REQUEST, message: "Value is too long" };
      default:
        return null;
    }
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    // Postgres rejects NUL (0x00) bytes in text.
    if (/invalid byte sequence for encoding|0x00/i.test(err.message)) {
      return { status: HttpStatus.BAD_REQUEST, message: "Invalid characters in request" };
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return { status: HttpStatus.BAD_REQUEST, message: "Invalid request" };
  }
  return null;
}

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientValidationError
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const mapped = mapPrismaError(exception);
    if (host.getType() !== "http") throw exception;
    const res = host.switchToHttp().getResponse<Response>();
    if (!mapped) {
      this.logger.error(exception instanceof Error ? exception.message.split("\n")[0] : "database error");
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: 500,
        message: "Internal server error",
      });
      return;
    }
    res.status(mapped.status).json({
      statusCode: mapped.status,
      message: mapped.message,
      error: mapped.status === 404 ? "Not Found" : mapped.status === 409 ? "Conflict" : "Bad Request",
    });
  }
}
