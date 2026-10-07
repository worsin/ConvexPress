import { acceptsPreviewMessage } from './customizeModel';

const MESSAGE = 'convexpress:customize';
/** Picking is ephemeral UI state, available only in a preview's established draft channel. */
export function installPreviewPicker(host: Window, previewing: boolean): () => void {
  if (!previewing || host.parent === host) return () => {};
  let origin: string | null = null;
  let picking = false;
  const style = host.document.createElement('style');
  style.textContent = '[data-customize]:hover { outline: 2px solid var(--primary); outline-offset: 3px; cursor: crosshair; }';
  const setPicking = (enabled: boolean) => {
    picking = enabled;
    if (enabled) host.document.head.append(style);
    else style.remove();
  };
  const message = (event: MessageEvent) => {
    if (acceptsPreviewMessage(previewing, event.source, host.parent, host, event.data)) {
      // A navigation to a new parent origin invalidates an outstanding selection.
      if (origin !== event.origin) setPicking(false);
      origin = event.origin;
      return;
    }
    if (event.source !== host.parent || !origin || event.origin !== origin) return;
    if (event.data?.type === `${MESSAGE}:pick` && typeof event.data.enabled === 'boolean') setPicking(event.data.enabled);
  };
  const click = (event: MouseEvent) => {
    if (!picking || !origin) return;
    const target = event.target as Element | null;
    const field = target?.closest?.<HTMLElement>('[data-customize]')?.dataset.customize;
    if (!field) return;
    event.preventDefault();
    event.stopPropagation();
    setPicking(false);
    host.parent.postMessage({ type: `${MESSAGE}:selected`, field }, origin);
  };
  const key = (event: KeyboardEvent) => {
    if (!picking || !origin || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setPicking(false);
    host.parent.postMessage({ type: `${MESSAGE}:cancelled` }, origin);
  };
  host.addEventListener('message', message);
  host.document.addEventListener('click', click, true);
  host.document.addEventListener('keydown', key, true);
  return () => {
    setPicking(false);
    host.removeEventListener('message', message);
    host.document.removeEventListener('click', click, true);
    host.document.removeEventListener('keydown', key, true);
  };
}
