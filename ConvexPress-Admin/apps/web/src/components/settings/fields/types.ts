export interface SettingsFieldAdapter<TValue = unknown> {
  name: string;
  state: {
    value: TValue;
    meta: {
      errors: readonly unknown[];
    };
  };
  handleChange: (value: unknown) => void;
  handleBlur: () => void;
}
