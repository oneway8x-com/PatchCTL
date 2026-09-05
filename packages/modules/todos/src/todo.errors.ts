export class TodoNotFoundError extends Error {
  public readonly code: string;

  constructor(id?: string) {
    super(id ? `The todo with ID ${id} could not be found.` : "The todo could not be found.");
    this.name = "TodoNotFoundError";
    this.code = "Todo:NotFound";
  }
}
