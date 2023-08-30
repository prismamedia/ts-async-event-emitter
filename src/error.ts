export class AbortError extends Error {
  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options);

    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
