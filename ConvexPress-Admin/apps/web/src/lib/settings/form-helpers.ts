export function getFieldError(
  field: { state: { meta: { errors: readonly unknown[] } } },
): string | undefined {
  const error = field.state.meta.errors[0];
  return error == null ? undefined : String(error);
}
