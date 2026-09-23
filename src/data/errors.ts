export type DomainErrorCode =
  | 'not_found'
  | 'invalid'
  | 'nesting_too_deep'
  | 'time_overlap'
  | 'backup_invalid'
  | 'backup_version'

/** Rule violation in the data layer. `code` is stable and can be mapped to i18n messages. */
export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}
