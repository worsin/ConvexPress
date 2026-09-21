# Subscriber direct posts route

Actual signed-in Aster subscriber navigation hid My posts, but /dashboard/posts mounted posts.queries.list and rendered Something went wrong. The backend correctly denied access.

Website useCapabilityAccess now distinguishes pending role resolution, allowed access and denial. MyPostsPage mounts its protected loader only after edit_posts is allowed, matching navigation. A denied user sees Posting is not available for this account. Backend authorization remains unchanged.

The isolated real-component regression proves pending/denied/revoked access never starts the protected query, while allowed access queries only the current author. Website typecheck, targeted lint, fresh hosting build and diff check passed. Native release nx7c7hm38bvzv427f4zgat3zq58dv857 published artifact59119cee0cfcb7f58278c4e795914736ccba5aa3a905baf34f2fe46d1c119f8c; real customer direct-route retest rendered the restricted state. Screenshot: output/aster-house/dashboard/aster-house-posts-restricted.png.

Broader cross-role capability-change, alternate dashboard base-path and all-template native acceptance are still separate gates.
