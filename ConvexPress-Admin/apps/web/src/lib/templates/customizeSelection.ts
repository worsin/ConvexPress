/** Focus a declared setting without interpolating message data into a selector. */
export function focusCustomizeField(root: HTMLElement | null, field: string): void {
  const wrapper = [...(root?.querySelectorAll<HTMLElement>('[data-customize-field]') ?? [])].find(element => element.dataset.customizeField === field);
  if (!wrapper) return;
  const control = wrapper.querySelector<HTMLElement>('[aria-pressed="true"]') ?? wrapper.querySelector<HTMLElement>('input,select,textarea,button,[tabindex]') ?? wrapper;
  control.scrollIntoView?.({ block: 'nearest' });
  control.focus();
}

export function selectedPreviewField(event: MessageEvent, frame: Window | null | undefined, origin: string, picking: boolean, fields: readonly string[]): string | null {
  if (!picking || !frame || event.source !== frame || event.origin !== origin || event.data?.type !== 'convexpress:customize:selected') return null;
  return typeof event.data.field === 'string' && fields.includes(event.data.field) ? event.data.field : null;
}
