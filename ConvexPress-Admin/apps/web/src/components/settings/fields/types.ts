export interface SettingsFieldApi<TValue = unknown> {
  name: string;
  state: {
    value: TValue;
    meta: {
      errors: readonly unknown[];
    };
  };
  handleBlur(): void;
  handleChange(value: TValue): void;
}

export function getFieldError(errors: readonly unknown[]): string | undefined {
  const error = errors[0];

  if (error === undefined || error === null) {
    return undefined;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
