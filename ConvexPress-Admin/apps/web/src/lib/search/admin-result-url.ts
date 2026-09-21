/** One destination for both pointer and keyboard selection in admin search. */
export function adminResultUrl(result: { contentType: "post" | "page" | "media" | "comment" | "course" | "product" | "event"; contentId: string }): string {
 const id = encodeURIComponent(result.contentId);
 switch (result.contentType) {
  case "post": return `/posts/${id}/edit`;
  case "page": return `/pages/${id}/edit`;
  case "media": return `/media/${id}/edit`;
  case "comment": return "/comments";
  case "course": return `/lms/courses/${id}`;
  case "event": return `/events/${id}`;
  case "product": return `/commerce/products/${id}`;
 }
}
