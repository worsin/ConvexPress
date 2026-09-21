import { defineDataBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import { Intro, Prose } from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
import { useSiteTimeZone } from "../../../../../contexts/SiteTimeZoneContext";
import { formatSiteDate } from "../../../../../lib/blog/date";
export default defineDataBlock(
	"core/latest-posts",
	"content.latestPosts",
	({ attrs, data }) => {
		const timeZone = useSiteTimeZone();
		return (
			<P.Stack gap="md">
				<div className="depot-stories-intro">
					<Intro
						eyebrow={attrs.eyebrow}
						heading={attrs.heading}
						body={attrs.body}
					/>
				</div>
				{data.items.length ? (
					<div className="depot-stories">
						<P.Grid columns={{ base: 1, md: 2, lg: 2 }} gap="md">
							{data.items.map((post) => (
								<article
									className="depot-story"
									key={post.id}
									data-has-image={!!post.image}
								>
									{post.image && <P.Image media={post.image} aspect="16/9" />}
									<div className="depot-story-copy">
										<P.Stack gap="sm">
											{post.publishedAt !== null && (
												<P.Text size="sm" tone="muted">
													<time
														dateTime={new Date(post.publishedAt).toISOString()}
													>
														{formatSiteDate(post.publishedAt, timeZone)}
													</time>
												</P.Text>
											)}
											<P.Heading level={3} size="md">
												<P.Link
													href={post.href}
													label={post.title || "Untitled post"}
												/>
											</P.Heading>
											{attrs.showExcerpts && post.excerpt && (
												<Prose text={post.excerpt} />
											)}
											{attrs.showAuthors && post.author && (
												<P.Text size="sm" tone="muted">
													By {post.author}
												</P.Text>
											)}
										</P.Stack>
									</div>
								</article>
							))}
						</P.Grid>
					</div>
				) : (
					<P.Text tone="muted">No posts to show yet.</P.Text>
				)}
			</P.Stack>
		);
	},
);
