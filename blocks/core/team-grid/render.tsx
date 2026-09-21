/** Staged Library treatment; no legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	CardCopy,
	CardCollection,
	Intro,
	Prose,
	ResolvedImage,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/team-grid", ({ attrs, resources }) => (
	<P.Stack gap="lg">
		<Intro {...attrs} />
		<CardCollection>
			<P.Grid columns={{ base: 1, md: 2, lg: 3 }} gap="lg">
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
							</P.Stack>
						</CardCopy>
					</article>
				))}
			</P.Grid>
		</CardCollection>
	</P.Stack>
));
