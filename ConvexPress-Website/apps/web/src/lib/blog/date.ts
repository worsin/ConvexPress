/** A publication timestamp is formatted in the site's zone, never the host's. */
export function formatSiteDate(value:string|number|null|undefined,timeZone="UTC",month:"short"|"long"="short"):string|null {
  if(value===null||value===undefined||value==="")return null;
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return new Intl.DateTimeFormat("en-US",{month,day:"numeric",year:"numeric",timeZone}).format(date);
}
