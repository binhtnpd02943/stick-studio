/** Exit 1 usage/IO, 2 schema or validation issues, 3 motion findings, 4 budget. */
export class CliError extends Error {
  constructor(
    readonly exitCode: 1 | 2 | 3 | 4,
    message: string,
  ) {
    super(message)
  }
}
