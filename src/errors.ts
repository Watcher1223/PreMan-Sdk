export class PremanError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly requestId: string | undefined;
  readonly body?: unknown;

  constructor(
    message: string,
    options: {
      status?: number | undefined;
      code?: string | undefined;
      requestId?: string | undefined;
      body?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "PremanError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.body = options.body;
  }
}

export class PremanConfigError extends PremanError {
  constructor(message: string) {
    super(message, { code: "config_error" });
    this.name = "PremanConfigError";
  }
}

export class PremanAuthError extends PremanError {
  constructor(message: string, options: { status?: number; requestId?: string | undefined; body?: unknown } = {}) {
    super(message, { ...options, code: "auth_error" });
    this.name = "PremanAuthError";
  }
}

export class PremanPolicyDeniedError extends PremanError {
  constructor(message: string, options: { status?: number; requestId?: string | undefined; body?: unknown } = {}) {
    super(message, { ...options, code: "policy_denied" });
    this.name = "PremanPolicyDeniedError";
  }
}
