/** Staged Library treatment; no legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	CardCopy,
	CardCollection,
	cardColumns,
	Intro,
	Prose,
	ResolvedImage,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/team-grid", ({ attrs, resources }) => (
	<P.Stack gap="lg">
		<Intro {...attrs} />
		<CardCollection>
			<P.Grid columns={cardColumns(attrs.members.length)} gap="lg">
				{attrs.members.map((member, index) => (
					<article key={index}>
						<CardCopy>
							<P.Stack gap="md">
								<ResolvedImage
									id={member.mediaId}
									alt={member.name || undefined}
									resources={resources}
								/>
								{member.role && <P.Eyebrow>{member.role}</P.Eyebrow>}
								{member.name && (
									<P.Heading level={3} size="md">
										{member.name}
									</P.Heading>
								)}
								{member.bio && <Prose text={member.bio} />}{" "}
								{member.href && (
									<P.Link
										href={member.href}
										label={
											member.name ? `Read about ${member.name}` : "Read profile"
										}
									/>
								)}
								{Boolean(member.links?.length) && (
									<ul className="cp-team-links">
										{member.links?.map((link, linkIndex) => <li key={linkIndex}><P.Link {...link} /></li>)}
									</ul>
								)}
							</P.Stack>
						</CardCopy>
					</article>
				))}
			</P.Grid>
		</CardCollection>
	</P.Stack>
));
