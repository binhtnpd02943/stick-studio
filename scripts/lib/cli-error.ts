/** Exit 1 usage/IO, 2 schema or validation issues, 3 motion findings. */
export class CliError extends Error {
  constructor(
    readonly exitCode: 1 | 2 | 3,
    message: string,
  ) {
    super(message)
  }
}
