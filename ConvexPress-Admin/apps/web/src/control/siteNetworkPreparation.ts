type Registration = {added: string[]; reloadRequired?: boolean};
/** One registration promise per document/selection. React effect replay must
 * observe the first result even when a second IPC call would add nothing. */
export function createSiteNetworkPreparation() {
  const requests = new Map<string, Promise<boolean>>();
  return (origins: string[], register: (origins: string[]) => Promise<Registration>) => {
    const key = JSON.stringify(origins);
    let request = requests.get(key);
    if (!request) {
      request = Promise.resolve().then(() => register(origins)).then(result => result.reloadRequired ?? result.added.length > 0);
      requests.set(key, request);
      void request.catch(() => { if (requests.get(key) === request) requests.delete(key); });
    }
    return request;
  };
}
export const prepareSiteNetwork = createSiteNetworkPreparation();
