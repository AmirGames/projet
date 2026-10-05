export class ApiError extends Error {
  constructor(public statusCode: number, message: string, public code?: string) {
    super(message); this.name = "ApiError";
  }
}
