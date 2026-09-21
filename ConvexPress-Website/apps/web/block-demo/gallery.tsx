import type { ReactNode } from "react";
import * as P from "../src/templates/sdk/primitives";
import workshop from "./assets/ceramic-workshop-editorial.png";

export function Specimen({
	name,
	children,
}: {
	name: P.PrimitiveName;
	children: ReactNode;
}) {
	return (
		<div className="specimen" data-primitive={name}>
			<span className="specimen-label">{name}</span>
			{children}
		</div>
	);
}
const media = {
	src: workshop,
	alt: "Sunlit ceramic studio with a cobalt pitcher and handmade vessels on a wooden workbench",
	width: 1536,
	height: 1024,
};
export function Gallery() {
	return (
		<>
			<div className="chapter" id="composition">
				<span>01 / Composition</span>
				<p>One vocabulary. Room for a point of view.</p>
			</div>
			<Specimen name="Section">
				<P.Section width="wide" spacing="spacious" label="The ceramic workshop">
					<Specimen name="Split">
						<P.Split ratio="equal" gap="lg" align="center">
							<Specimen name="Stack">
								<P.Stack gap="lg">
									<Specimen name="Eyebrow">
										<P.Eyebrow>Studio notes / No. 001</P.Eyebrow>
									</Specimen>
									<Specimen name="Heading">
										<P.Heading level={2} size="display">
											A little room
											<br />
											for making.
										</P.Heading>
									</Specimen>
									<Specimen name="Text">
										<P.Text size="lg">
											Clay on the table. Light through the window. A slower kind
											of work, made to be held.
										</P.Text>
									</Specimen>
									<Specimen name="Button">
										<P.Button label="Explore the studies" href="#studies" />
									</Specimen>
								</P.Stack>
							</Specimen>
							<Specimen name="Image">
								<P.Image
									media={media}
									aspect="4/5"
									priority
									caption="Material study 001 — light, clay, cobalt."
								/>
							</Specimen>
						</P.Split>
					</Specimen>
				</P.Section>
			</Specimen>

			<div className="chapter" id="studies">
				<span>02 / Type & material</span>
				<p>Small details, considered together.</p>
			</div>
			<P.Section
				width="wide"
				spacing="spacious"
				label="Type and material specimens"
			>
				<Specimen name="Container">
					<P.Container width="wide">
						<Specimen name="Grid">
							<P.Grid columns={{ base: 1, md: 2, lg: 3 }} gap="lg">
								<Specimen name="Card">
									<P.Card>
										<P.Stack gap="md">
											<P.Eyebrow>The object</P.Eyebrow>
											<P.Heading level={3} size="md">
												Quiet utility.
											</P.Heading>
											<P.Text>
												Honest shapes. Useful proportions. A place for every
												part.
											</P.Text>
											<P.Link label="Read the material notes" href="#details" />
										</P.Stack>
									</P.Card>
								</Specimen>
								<Specimen name="Quote">
									<P.Quote
										quote="The hand remembers what the eye is still learning."
										attribution="From the studio notebook"
										source="Demonstration copy"
									/>
								</Specimen>
								<Specimen name="Stat">
									<P.Stat
										value="25"
										label="Primitive contracts"
										detail="A tested foundation for composition. The full block matrix is a separate acceptance gate."
									/>
								</Specimen>
							</P.Grid>
						</Specimen>
						<div className="gallery-space" />
						<Specimen name="Columns">
							<P.Columns count={2} gap="lg">
								<Specimen name="RichText">
									<P.RichText
										content={{
											type: "doc",
											content: [
												{
													type: "paragraph",
													content: [
														{
															type: "text",
															text: "A good foundation leaves space for ",
														},
														{
															type: "text",
															text: "individual expression",
															marks: [{ type: "italic" }],
														},
														{
															type: "text",
															text: ". This structured paragraph is rendered through the closed rich-text contract, with ",
														},
														{
															type: "text",
															text: "safe inline links",
															marks: [
																{ type: "link", attrs: { href: "#coverage" } },
															],
														},
														{ type: "text", text: "." },
													],
												},
											],
										}}
									/>
								</Specimen>
								<Specimen name="List">
									<P.List
										items={[
											"A clear reading rhythm",
											"Materials with contrast",
											"Space that makes sense",
										]}
										gap="md"
									/>
								</Specimen>
							</P.Columns>
						</Specimen>
						<div className="gallery-space" />
						<Specimen name="Divider">
							<P.Divider />
						</Specimen>
						<P.Stack direction="horizontal" gap="lg" align="center">
							<Specimen name="Badge">
								<P.Badge label="Hand finished" tone="muted" />
							</Specimen>
							<Specimen name="Icon">
								<P.Icon name="star" label="Featured study" />
							</Specimen>
							<Specimen name="Link">
								<P.Link label="Back to the composition" href="#composition" />
							</Specimen>
							<Specimen name="Slot">
								<P.Slot name="studio-note" />
							</Specimen>
						</P.Stack>
					</P.Container>
				</Specimen>
			</P.Section>

			<div className="chapter" id="details">
				<span>03 / Behavior</span>
				<p>Useful interactions. Nothing in the way.</p>
			</div>
			<P.Section
				width="wide"
				spacing="spacious"
				label="Interactive specimens"
				motion="reveal"
			>
				<P.Grid columns={{ base: 1, md: 2 }} gap="lg">
					<Specimen name="Tabs">
						<P.Tabs
							label="Studio materials"
							items={[
								{
									id: "clay",
									title: "Clay",
									body: "Stoneware begins as a soft, responsive material. Shape comes first; finish follows.",
								},
								{
									id: "glaze",
									title: "Glaze",
									body: "Cobalt settles into the edges. Each surface holds the light a little differently.",
								},
								{
									id: "fire",
									title: "Fire",
									body: "Time and temperature make the final marks. Arrow keys, Home and End move between these tabs.",
								},
							]}
						/>
					</Specimen>
					<Specimen name="Accordion">
						<P.Accordion
							label="About this study"
							items={[
								{
									id: "purpose",
									title: "What am I looking at?",
									body: "An isolated SDK primitive gallery. The current storefront routes are unchanged.",
								},
								{
									id: "themes",
									title: "What changes with a pack?",
									body: "Real manifest colors and typography, plus opted-in Journal or Depot primitive parts. Core and Aster House use the SDK baseline.",
								},
								{
									id: "motion",
									title: "How does motion behave?",
									body: "The marquee starts paused, has a visible pause control and respects your device’s reduced-motion preference.",
								},
							]}
						/>
					</Specimen>
					<Specimen name="Video">
						<P.Video
							src="/media/workshop-fixture.webm"
							title="Ceramic studio — still-image video fixture"
							poster={workshop}
							aspect="3/2"
							captions={{
								src: "/media/workshop-fixture.vtt",
								language: "en",
								label: "English description",
							}}
						/>
						<p className="fixture-note">
							Four-second still-image fixture. Tests native video controls and
							captions; this is not workshop footage.
						</p>
					</Specimen>
					<div className="motion-study">
						<Specimen name="Marquee">
							<P.Marquee
								items={["Shape", "Surface", "Light", "Time"]}
								label="Studio qualities"
								speed="slow"
							/>
						</Specimen>
						<P.Text size="sm">
							Motion is a choice. The track stays still until you press play.
						</P.Text>
					</div>
				</P.Grid>
			</P.Section>
		</>
	);
}
