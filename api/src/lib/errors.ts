/** Typed API errors with safe, user-facing messages (never stack traces). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, "bad_request", message, details);
export const unauthorized = (message = "Please sign in to continue.") =>
  new ApiError(401, "unauthorized", message);
export const forbidden = (message = "You do not have access to this resource.") =>
  new ApiError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new ApiError(404, "not_found", message);
export const tooMany = (message = "Too many attempts. Please wait a moment and try again.") =>
  new ApiError(429, "rate_limited", message);
export const serverError = (message = "Something went wrong on our side. Please try again.") =>
  new ApiError(500, "server_error", message);
