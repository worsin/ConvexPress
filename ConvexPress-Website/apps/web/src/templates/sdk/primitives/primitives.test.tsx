import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { primitiveNames, validatePrimitiveProps } from "./contracts";
import {
	Section,
	RichText,
	Heading,
	Image,
	Button,
	Tabs,
	Accordion,
	Marquee,
	PrimitiveProvider,
	BasePrimitives,
	createPackPartsRegistry,
} from "./index";

test("closed composition vocabulary rejects arbitrary DOM/CSS and unsafe URLs", () => {
	expect(primitiveNames.length).toBe(25);
	for (const props of [
		{ className: "anything" },
		{ style: { color: "red" } },
		{ onClick: "evil" },
		{ width: "100px" },
	])
		expect(() => validatePrimitiveProps("Section", props)).toThrow();
	for (const href of [
		"javascript:alert(1)",
		"//host.invalid",
		"data:text/html,unsafe",
		"/\\evil.invalid",
	])
		expect(() =>
			validatePrimitiveProps("Button", { label: "Go", href }),
		).toThrow();
	expect(() =>
		validatePrimitiveProps("Grid", { columns: { base: 20 } }),
	).toThrow();
	expect(() =>
		validatePrimitiveProps("Section", { layout: { align: "end" } }),
	).toThrow();
});
test("SSR provides real content, accessible names, and bounded media", () => {
	const html = renderToStaticMarkup(
		<Section label="Our story" anchor="story" blockId="blk_story">
			<Heading level={2}>The field notes</Heading>
			<Image
				media={{
					src: "/mountain.jpg",
					alt: "Mountain at dusk",
					width: 1200,
					height: 800,
				}}
			/>
			<Button label="Read the journal" href="/journal" />
		</Section>,
	);
	expect(html).toContain('aria-label="Our story"');
	expect(html).toContain('data-block-id="blk_story"');
	expect(html).toContain("<h2");
	expect(html).toContain('alt="Mountain at dusk"');
	expect(html).toContain('width="1200"');
	expect(html).toContain('loading="lazy"');
	expect(html).toContain('href="/journal"');
});
test("nested sections share their parent's gutter and preserve explicit spacing", () => {
	const html = renderToStaticMarkup(
		<Section blockId="outer">
			<Section blockId="nested">
				<Section blockId="deep">Nested copy</Section>
			</Section>
			<Section
				blockId="explicit"
				layout={{ spacing: "compact", width: "wide" }}
			>
				Explicit copy
			</Section>
			<Section blockId="explicit-default" spacing="default">
				Default copy
			</Section>
		</Section>,
	);
	expect(/data-block-id="outer"[^>]*data-spacing="default"/.test(html)).toBe(
		true,
	);
	expect(/data-block-id="nested"[^>]*data-spacing="none"/.test(html)).toBe(
		true,
	);
	expect(/data-block-id="deep"[^>]*data-spacing="none"/.test(html)).toBe(true);
	expect(/data-block-id="explicit"[^>]*data-spacing="compact"/.test(html)).toBe(
		true,
	);
	expect(
		/data-block-id="explicit-default"[^>]*data-spacing="default"/.test(html),
	).toBe(true);
	expect(html.match(/data-nested="true"/g)?.length).toBe(4);
	expect(html).toContain('data-width="wide"');
	expect(html).toContain("Nested copy");
});
test("interactive SSR has native disclosure and a single selected tab", () => {
	const items = [
		{ id: "one", title: "Arrival", body: "Come at noon." },
		{ id: "two", title: "Departure", body: "Leave at dusk." },
	];
	const html = renderToStaticMarkup(
		<>
			<Accordion items={items} />
			<Tabs label="Visit information" items={items} />
			<Marquee label="Places" items={["Forest", "Meadow"]} />
		</>,
	);
	expect(html).toContain("<summary");
	expect(html).toContain('role="tablist"');
	expect(html.match(/aria-selected="true"/g)?.length).toBe(1);
	expect(html).toContain("Play motion");
});
test("pack resolution is isolated and a self-wrapping override terminates at baseline", () => {
	const parts = createPackPartsRegistry({
		journal: {
			Heading: (props) => (
				<Heading {...props}>Journal: {props.children}</Heading>
			),
		},
		depot: {
			Heading: (props) => (
				<BasePrimitives.Heading {...props}>
					Depot: {props.children}
				</BasePrimitives.Heading>
			),
		},
	});
	const render = (packId: string) =>
		renderToStaticMarkup(
			<PrimitiveProvider packId={packId} registry={parts}>
				<Heading>Story</Heading>
			</PrimitiveProvider>,
		);
	expect(render("journal")).toContain("Journal: Story");
	expect(render("journal")).not.toContain("Depot:");
	expect(render("unknown")).not.toContain("Journal:");
	expect(render("unknown")).toContain("Story");
});

test("every listed baseline has the same strict composition contract", async () => {
	const { createElement } = await import("react");
	const { primitivePropDefinitions } = await import("./contracts");
	const examples: Record<string, object> = {
		Section: {},
		Container: {},
		Stack: {},
		Grid: { columns: { base: 1, md: 2, lg: 3 } },
		Columns: {},
		Split: {},
		Card: {},
		Heading: {},
		Eyebrow: {},
		Text: {},
		RichText: {
			content: {
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [
							{ type: "text", text: "A field note", marks: [{ type: "bold" }] },
						],
					},
				],
			},
		},
		Image: { media: { src: "/forest.jpg", alt: "Forest" } },
		Video: {
			src: "/walk.mp4",
			title: "A woodland walk",
			captions: { src: "/walk.vtt", language: "en", label: "English" },
		},
		Icon: { name: "check", label: "Included" },
		Button: { href: "/visit", label: "Visit" },
		Link: { href: "/journal", label: "Journal" },
		Badge: { label: "Seasonal" },
		Divider: {},
		Stat: { value: "12", label: "Trails" },
		Quote: { quote: "Walk slowly.", attribution: "The guide" },
		List: { items: ["Forest", "Meadow"] },
		Accordion: { items: [{ id: "a", title: "Arrival", body: "At noon." }] },
		Tabs: {
			label: "Visit",
			items: [{ id: "a", title: "Arrival", body: "At noon." }],
		},
		Marquee: { items: ["Forest"], label: "Places" },
		Slot: { name: "aside" },
	};
	expect(Object.keys(examples).sort()).toEqual([...primitiveNames].sort());
	// The runtime adapter supplies the same validated data shape consumed by React.
	for (const name of primitiveNames) {
		const props = validatePrimitiveProps(name, examples[name]);
		expect(primitivePropDefinitions[name].additionalProperties).toBe(false);
		expect(Object.keys(props).includes("className")).toBe(false);
	}
	const rendered = renderToStaticMarkup(
		createElement(BasePrimitives.RichText, {
			...validatePrimitiveProps("RichText", examples.RichText),
		}),
	);
	expect(rendered).toContain("<strong>A field note</strong>");
});

test("unknown override names and runtime CSS escapes are rejected before markup", () => {
	expect(() => createPackPartsRegistry({ "invalid/pack": {} })).toThrow();
	expect(() =>
		renderToStaticMarkup(
			<Section {...JSON.parse('{"className":"injected"}')} />,
		),
	).toThrow();
});

test("tab and disclosure identifiers stay unique", () => {
	const items = [
		{ id: "same", title: "First", body: "One" },
		{ id: "same", title: "Second", body: "Two" },
	];
	expect(() =>
		validatePrimitiveProps("Tabs", { label: "Choices", items }),
	).toThrow("unique");
	expect(() => validatePrimitiveProps("Accordion", { items })).toThrow(
		"unique",
	);
});

test("a rich document cannot multiply individually valid fields into an oversized payload", () => {
	const content = {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: Array.from({ length: 20 }, () => ({
					type: "text",
					text: "a".repeat(10000),
				})),
			},
		],
	};
	expect(() => validatePrimitiveProps("RichText", { content })).toThrow(
		"bounded payload",
	);
});

test("canonical rich text preserves underline, line breaks and safe link targets in inline headings", () => {
	const content = {
		type: "doc" as const,
		content: [
			{
				type: "paragraph" as const,
				content: [
					{
						type: "text" as const,
						text: "Marked",
						marks: [
							{ type: "underline" as const },
							{
								type: "link" as const,
								attrs: {
									href: "https://example.test",
									target: "_blank" as const,
								},
							},
						],
					},
					{ type: "hardBreak" as const },
					{ type: "text" as const, text: "Next line" },
				],
			},
		],
	};
	const html = renderToStaticMarkup(
		<Heading level={2}>
			<RichText content={content} inline />
		</Heading>,
	);
	expect(html).toContain("<u>");
	expect(html).toContain("<br/>");
	expect(html).toContain('target="_blank"');
	expect(html).toContain('rel="noopener noreferrer"');
	expect(html.includes("<p>")).toBe(false);
	expect(() =>
		renderToStaticMarkup(
			<RichText
				content={{
					...content,
					content: [...content.content, ...content.content],
				}}
				inline
			/>,
		),
	).toThrow();
});

test("canonical rich text renders authored markup literally and refuses active links", () => {
  const text = '<img src=x onerror="alert(1)"> <script>alert(2)</script>';
  const content = {type:"doc",content:[{type:"paragraph",content:[{type:"text",text}]}]};
  const props = validatePrimitiveProps("RichText", {content});
  const html = renderToStaticMarkup(<RichText {...props} />);
  expect(html).toContain("&lt;img");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script");
  for (const href of ["javascript:alert(1)","java\nscript:alert(1)","data:text/html,test","/\\example.com","//example.com"])
    expect(() => validatePrimitiveProps("RichText", {content:{type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"Kept text",marks:[{type:"link",attrs:{href}}]}]}]}})).toThrow();
});
