/** The message of a thrown error, or the thrown value as text when it isn't an Error. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
