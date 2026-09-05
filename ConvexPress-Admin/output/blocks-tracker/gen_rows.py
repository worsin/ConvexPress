import json
rows=[]
def add(name,title,cat,tier="Library",role="content",exists=False,loc="",desc="",fields="",dyn=False,resolver="",children=False,intents="width, tone, spacing",prio="P2",phase=None,migrates="",plugin="",styles="",notes="",owner="Astra",tj=None,td=None):
    ns=name.split("/")[0]
    if phase is None:
        phase="Phase 1" if exists else ("Phase 5" if dyn else "Phase 6")
    r={"Name":name,"Title":title,"Category":cat,"Tier":tier,"Role":role,"Status":"Built" if exists else "Planned","Phase":phase,"Priority":prio,
       "Exists Today":exists,"Current Location":loc,"Spec Path":f"blocks/{ns}/{name.split('/')[1]}/block.json","Description":desc,"Key Fields":fields,
       "Dynamic":dyn,"Data Resolver":resolver,"Supports Children":children,"Layout Intents":intents,"Named Styles":styles,"Tests":False,"Screenshots":False,
       "Plugin":plugin,"Migrates From":migrates,"Owner":owner,"Notes":notes or ("Legacy registry entry; migrate to spec folder in Phase 1." if exists and ns=="core" else ("Portable four-file block; migrate to spec folder in Phase 1." if exists else ""))}
    if prio=="P0 Flagship": r["Treatment: Journal"]=tj or "Owned renderer"; r["Treatment: Depot"]=td or "Owned renderer"
    rows.append(r)
CORE="ConvexPress-Admin/apps/web/src/lib/blocks/registry.tsx (+ Website lib/blocks/registry.tsx)"
P=lambda id:f"apps/web/src/blocks/{id}/ (Admin + Website)"
# ---- Text
add("core/paragraph","Paragraph","Text",exists=True,loc=CORE,desc="Plain prose paragraph with inline emphasis.",fields="body (richtext)",intents="width, align",migrates="TipTap paragraph")
add("core/heading","Heading","Text",exists=True,loc=CORE,desc="Section heading H1-H6 with anchor.",fields="level, text, anchor",intents="width, align",migrates="TipTap heading")
add("core/list","List","Text",exists=True,loc=CORE,desc="Bulleted, numbered or task list.",fields="style, items[]",intents="width",migrates="TipTap bulletList/orderedList/taskList")
add("core/quote","Quote","Text",exists=True,loc=CORE,desc="Blockquote with attribution.",fields="text, cite",intents="width, align",migrates="TipTap blockquote")
add("core/pullquote","Pullquote","Text",desc="Large editorial quote that breaks the reading measure.",fields="text, cite",intents="width, align, tone",prio="P1")
add("core/code","Code","Text",exists=True,loc=CORE,desc="Syntax-highlighted code with filename.",fields="language, code, filename",intents="width",migrates="TipTap codeBlock")
add("core/table","Table","Text",desc="Data table with header row and optional caption.",fields="columns[], rows[][], caption, striped",intents="width",prio="P1",migrates="TipTap table")
add("core/callout","Callout","Text",desc="Highlighted note, tip or warning.",fields="kind, title, body",intents="width",migrates="TipTap callout")
add("core/rich-text","Rich text","Text",exists=True,loc=CORE,desc="TipTap document for long-form prose; inline marks only, all other nodes are blocks. Replaces article mode.",fields="doc (richtext)",intents="width",phase="Phase 2",migrates="contentMode=article posts.content (TipTap doc)",notes="Existing core/rich-text is markdown-in-textarea; Phase 2 makes it the TipTap block and migrates article content into it.")
add("core/table-of-contents","Table of contents","Text",desc="Auto-built from the page's headings.",fields="depth, title",intents="width",role="aside")
add("core/footnotes","Footnotes","Text",desc="Numbered notes referenced from rich text.",fields="notes[]",intents="width",role="utility")
# ---- Layout
add("core/section","Section","Layout",desc="Container carrying layout intents; the unit packs style with tokens and Section part.",fields="(children only)",children=True,intents="width, tone, spacing, align",prio="P0 Flagship",phase="Phase 2")
add("core/columns","Columns","Layout",desc="2-4 columns with responsive stacking; each column is a child group.",fields="columns, ratio, verticalAlign",children=True,prio="P0 Flagship",phase="Phase 2",migrates="TipTap columns (was flattened by importer)")
add("core/group","Group","Layout",desc="Plain container for nesting and locking.",fields="(children only)",children=True,phase="Phase 2")
add("core/grid","Grid","Layout",desc="Responsive grid of child blocks.",fields="columns{base,md,lg}, gap",children=True,phase="Phase 2")
add("core/split","Split","Layout",desc="Two-pane split with a media or child side and a content side.",fields="ratio, side",children=True,prio="P1")
add("core/spacer","Spacer","Layout",exists=True,loc=CORE,desc="Vertical space in named sizes.",fields="size",intents="",role="utility",migrates="TipTap spacer")
add("core/divider","Divider","Layout",exists=True,loc=CORE,desc="Horizontal rule.",fields="style",intents="width",role="utility",migrates="TipTap divider")
add("core/sticky-aside","Sticky aside","Layout",desc="Sidebar column that sticks while the main column scrolls.",fields="side",children=True,role="aside")
add("core/accordion","Accordion","Layout",exists=True,loc=CORE,desc="Expandable panels.",fields="items[{title, body}], allowMultiple",prio="P1")
add("core/tabs","Tabs","Layout",exists=True,loc=CORE,desc="Tabbed panels.",fields="tabs[{label, body}]",prio="P1")
# ---- Media
add("core/image","Image","Media",exists=True,loc=CORE,desc="Single image with caption and link.",fields="media, caption, link",intents="width, align",migrates="TipTap image (align/full-bleed only existed there)")
add("core/gallery","Gallery","Media",desc="Grid or masonry gallery with lightbox.",fields="items[media], columns, lightbox",prio="P1",migrates="TipTap gallery")
add("core/carousel","Carousel","Media",desc="Slides of media or child blocks with autoplay.",fields="items[], autoplay, interval",children=True,prio="P1")
add("core/video","Video","Media",desc="Self-hosted or provider video with poster.",fields="media|url, poster, autoplay, loop",intents="width, align")
add("core/audio","Audio","Media",desc="Audio player with title and transcript link.",fields="media, title, transcriptUrl",intents="width")
add("core/embed","Embed","Media",exists=True,loc=CORE,desc="Allow-listed provider embed in a sandboxed frame.",fields="url, caption, provider",intents="width, align",migrates="TipTap embed")
add("core/before-after","Before / after","Media",desc="Slider comparing two images.",fields="before, after, labels",intents="width")
add("core/lightbox-grid","Lightbox grid","Media",desc="Thumbnail grid opening a full-screen viewer.",fields="items[media], columns")
add("core/logo-cloud","Logo cloud","Media",exists=True,loc=CORE,desc="Row of partner or press logos.",fields="title, logos[{media, name, url}]",prio="P1")
add("core/map","Map","Media",desc="Static or embedded map with pin and address.",fields="address, lat, lng, zoom, provider")
add("core/file-download","File download","Media",desc="Downloadable file card with size and type.",fields="media, title, description",role="utility")
# ---- Openers
add("core/hero","Hero","Openers",exists=True,loc=CORE,role="hero",desc="Headline, supporting copy, primary and secondary CTA, optional media.",fields="eyebrow, title, subtitle, primaryCta, secondaryCta, media",prio="P0 Flagship",styles="default, editorial, poster")
add("core/hero-split","Hero split","Openers",exists=True,loc=CORE,role="hero",desc="Copy on one side, media on the other.",fields="eyebrow, title, subtitle, cta, media, mediaSide",prio="P0 Flagship")
add("core/hero-text-only","Hero text only","Openers",exists=True,loc=CORE,role="hero",desc="Statement hero without media.",fields="eyebrow, title, subtitle, cta",prio="P1")
add("core/hero-video","Hero video","Openers",role="hero",desc="Full-bleed looping video with overlay copy.",fields="video, poster, title, subtitle, cta",prio="P1")
add("blocks/page-banner","Page banner","Openers",exists=True,loc=P("page-banner"),role="opener",desc="Interior page opener with breadcrumb label, title, media and CTA.",fields="eyebrow, title, subtitle, media, breadcrumbLabel, cta",prio="P0 Flagship")
add("core/announcement-bar","Announcement bar","Openers",role="utility",desc="Dismissible strip for promotions or notices.",fields="text, link, dismissible, schedule",intents="tone")
add("core/breadcrumbs","Breadcrumbs","Openers",role="utility",desc="Explicit breadcrumb trail when the surface does not render one.",fields="items[] or auto",intents="width")
# ---- Marketing
add("core/feature-grid","Feature grid","Marketing",exists=True,loc=CORE,desc="3-8 benefits with icon, title, body.",fields="eyebrow, title, body, items[{icon, title, body, link}]",prio="P0 Flagship",styles="default, cards, minimal")
add("core/feature-list-alternating","Feature list alternating","Marketing",exists=True,loc=CORE,desc="Media and copy rows alternating sides.",fields="items[{title, body, media, cta}]",prio="P1")
add("core/bento-grid","Bento grid","Marketing",exists=True,loc=CORE,desc="Mixed-size tile grid.",fields="tiles[{size, title, body, media}]",prio="P1")
add("core/stats-band","Stats band","Marketing",exists=True,loc=CORE,desc="Row of headline numbers.",fields="items[{value, label, note}]",prio="P1")
add("core/cta-band","CTA band","Marketing",exists=True,loc=CORE,role="cta",desc="Full-width call to action with one or two buttons.",fields="title, body, primaryCta, secondaryCta",prio="P0 Flagship",styles="default, inset")
add("core/cta-with-form","CTA with form","Marketing",exists=True,loc=CORE,role="cta",desc="Call to action with an inline capture form.",fields="title, body, form, submitLabel",prio="P1")
add("core/media-text","Media + text","Marketing",exists=True,loc=CORE,desc="Image or video beside copy and CTA.",fields="media, mediaSide, title, body, cta",prio="P0 Flagship")
add("core/process-steps","Process steps","Marketing",exists=True,loc=CORE,desc="Numbered how-it-works steps.",fields="items[{title, body, media}]",prio="P1")
add("core/roadmap-timeline","Roadmap timeline","Marketing",exists=True,loc=CORE,desc="Dated milestones.",fields="items[{date, title, body, status}]")
add("blocks/story-timeline","Story timeline","Marketing",exists=True,loc=P("story-timeline"),desc="Narrative timeline with media per entry.",fields="items[{year, title, body, media}]")
add("core/comparison-table","Comparison table","Marketing",exists=True,loc=CORE,desc="Feature-by-plan or product comparison.",fields="columns[], rows[{label, values[]}]",prio="P1")
add("core/pricing-cards","Pricing cards","Marketing",exists=True,loc=CORE,desc="Plan cards with features and CTA.",fields="plans[{name, price, period, features[], cta, highlighted}]",prio="P0 Flagship")
add("core/pricing-table","Pricing table","Marketing",desc="Dense plan comparison table with toggles.",fields="plans[], rows[], billingToggle",prio="P1")
add("core/faq","FAQ","Marketing",exists=True,loc=CORE,desc="Question and answer list with schema.org markup.",fields="title, items[{question, answer}]",prio="P0 Flagship")
add("core/testimonials","Testimonials","Marketing",exists=True,loc=CORE,desc="Customer quotes with name, role, avatar.",fields="items[{quote, name, role, media}]",prio="P0 Flagship",styles="default, editorial, wall")
add("core/testimonial-wall","Testimonial wall","Marketing",desc="Masonry of many short quotes.",fields="items[]",prio="P1")
add("core/trust-badges","Trust badges","Marketing",desc="Guarantees, certifications, payment marks.",fields="items[{icon|media, label}]",prio="P1")
add("blocks/media-mentions","Media mentions","Marketing",exists=True,loc=P("media-mentions"),desc="Press logos with quotes and links.",fields="items[{outlet, quote, url, media}]")
add("core/team-grid","Team grid","Marketing",exists=True,loc=CORE,desc="People cards.",fields="members[{name, role, bio, media, links}]",prio="P1")
add("blocks/promo-band","Promo band","Marketing",exists=True,loc=P("promo-band"),role="cta",desc="Offer strip with code and expiry.",fields="title, body, code, cta, expires")
add("core/countdown","Countdown","Marketing",desc="Timer to a date with expired state.",fields="target, title, expiredText, cta",prio="P1")
add("blocks/tabbed-content","Tabbed content","Marketing",exists=True,loc=P("tabbed-content"),desc="Tabs whose panels hold rich content.",fields="tabs[{label, body, media}]")
add("core/steps-with-media","Steps with media","Marketing",desc="Sticky media that changes as the reader scrolls through steps.",fields="steps[{title, body, media}]")
add("core/feature-tabs","Feature tabs","Marketing",desc="Tabs switching a large media preview.",fields="tabs[{label, title, body, media}]")
add("core/marquee","Marquee","Marketing",desc="Scrolling strip of words or logos.",fields="items[], speed",intents="tone")
# ---- Social
add("blocks/customer-showcase","Customer showcase","Social",exists=True,loc=P("customer-showcase"),desc="Customer logos or stories in a grid.",fields="items[{name, media, url, quote}]",prio="P1")
add("blocks/social-share","Social share","Social",exists=True,loc=P("social-share"),role="utility",desc="Share buttons for the current page.",fields="networks[], label")
add("core/social-links","Social links","Social",exists=True,loc=CORE,role="utility",desc="Profile links from site settings or explicit list.",fields="items[{network, url}]")
add("core/reviews","Reviews","Social",dyn=True,resolver="commerce.reviews",desc="Live product or site reviews with rating summary.",fields="source (product|site), limit, minRating",prio="P1")
add("core/social-feed","Social feed","Social",desc="Embedded provider feed (allow-listed).",fields="provider, handle, limit")
add("core/ugc-grid","UGC grid","Social",dyn=True,resolver="media.tagged",desc="Grid of tagged customer media from the media library.",fields="tag, limit, columns")
# ---- Commerce
add("commerce/product-showcase","Product showcase","Commerce",exists=True,loc=P("product-showcase"),dyn=True,resolver="commerce.productCards",desc="Curated or query-driven product cards.",fields="mode (slugs|query), slugs[], query{category, sort, sale}, limit, columns",prio="P0 Flagship",phase="Phase 1",notes="Today calls useQuery inside the renderer with api as any; Phase 5 moves it to the resolver.")
add("blocks/product-collection","Product collection","Commerce",exists=True,loc=P("product-collection"),dyn=True,resolver="commerce.productCards",desc="Hand-picked products with editorial copy per item.",fields="title, items[{product (reference), blurb}]",prio="P1",phase="Phase 1",notes="Today bakes product data into attrs; Phase 5 switches to reference fields + resolver.")
add("commerce/category-tiles","Category tiles","Commerce",exists=True,loc=P("category-tiles"),dyn=True,resolver="commerce.categoryTiles",desc="Category cards with image and count.",fields="slugs[], limit, columns",prio="P0 Flagship",phase="Phase 1")
add("core/featured-products","Featured products","Commerce",exists=True,loc=CORE,dyn=True,resolver="commerce.productCards",desc="Products flagged featured.",fields="limit, columns",prio="P1",phase="Phase 1",notes="Attrs-only stub today.")
add("commerce/assistant-band","Assistant band","Commerce",exists=True,loc=P("assistant-band"),role="cta",desc="Invitation to the AI shopping assistant with starter prompts.",fields="title, prompts[] (defaults from commerce.assistant settings)",prio="P1",phase="Phase 1")
add("commerce/product-compare","Product compare","Commerce",dyn=True,resolver="commerce.productCompare",desc="Side-by-side attribute comparison of chosen products.",fields="products[] (reference), attributes[]",prio="P1")
add("commerce/bundle-offer","Bundle offer","Commerce",dyn=True,resolver="commerce.bundle",desc="Bundle with combined price and add-all-to-cart.",fields="bundle (reference), title, body",prio="P1")
add("commerce/sale-countdown","Sale countdown","Commerce",dyn=True,resolver="commerce.productCards",role="cta",desc="Timer plus the products on sale.",fields="target, title, limit")
add("commerce/recently-viewed","Recently viewed","Commerce",dyn=True,resolver="commerce.recentlyViewed",desc="Visitor's recently viewed products (client token).",fields="limit, title")
add("commerce/cart-cta","Cart CTA","Commerce",dyn=True,resolver="commerce.cartSummary",role="cta",desc="Cart summary strip with checkout button.",fields="title, emptyText")
add("commerce/search-band","Search band","Commerce",role="utility",desc="Product search input with suggested queries.",fields="placeholder, suggestions[]",prio="P1")
add("commerce/brand-list","Brand list","Commerce",dyn=True,resolver="commerce.brands",desc="Brand logos linking to filtered catalog.",fields="limit, columns")
add("commerce/product-hero","Product hero","Commerce",dyn=True,resolver="commerce.product",role="hero",desc="Single product spotlight with price and add to cart.",fields="product (reference), title override, media override",prio="P1")
add("commerce/variant-picker-teaser","Variant picker teaser","Commerce",dyn=True,resolver="commerce.product",desc="Colour or size swatches leading to the product page.",fields="product (reference), attribute")
add("commerce/shipping-promise","Shipping promise","Commerce",role="utility",desc="Delivery, returns and guarantee strip from settings.",fields="items[{icon, title, body}] (defaults from shipping settings)")
# ---- Discovery
add("core/latest-posts","Latest posts","Discovery",exists=True,loc=CORE,dyn=True,resolver="content.posts",desc="Newest posts as cards or list.",fields="limit, layout, category",prio="P0 Flagship",phase="Phase 1",notes="Attrs-only stub today.")
add("core/post-grid","Post grid","Discovery",dyn=True,resolver="content.posts",desc="Posts by taxonomy query with pagination.",fields="query{category, tag, author}, limit, columns, showExcerpt",prio="P1")
add("core/author-bio","Author bio","Discovery",exists=True,loc=CORE,dyn=True,resolver="content.author",desc="Author card from the post's author or an explicit user.",fields="author (reference) | current",phase="Phase 1")
add("core/tag-cloud","Tag cloud","Discovery",exists=True,loc=CORE,dyn=True,resolver="content.tags",desc="Weighted tag links.",fields="limit, taxonomy",role="aside",phase="Phase 1")
add("core/related-content","Related content","Discovery",dyn=True,resolver="content.related",desc="Posts or products related to the current document.",fields="limit, type",role="aside",prio="P1")
add("core/archive-list","Archive list","Discovery",dyn=True,resolver="content.archive",desc="Month or category archive links.",fields="groupBy, limit",role="aside")
add("core/search-box","Search box","Discovery",role="utility",desc="Site search input.",fields="placeholder, scope")
add("core/featured-page","Featured page","Discovery",dyn=True,resolver="content.page",desc="Card for a chosen page with its featured image and excerpt.",fields="page (reference), ctaLabel")
add("core/child-pages","Child pages","Discovery",dyn=True,resolver="content.childPages",desc="List of the current page's children (replaces the copied ChildPages in pack surfaces).",fields="depth, layout",role="aside")
# ---- Forms
add("core/contact-form","Contact form","Forms",exists=True,loc=CORE,desc="Name, email, message form posting to notifications.",fields="title, fields[], submitLabel, successText",prio="P1")
add("core/newsletter-signup","Newsletter signup","Forms",exists=True,loc=CORE,role="cta",desc="Email capture strip.",fields="title, body, submitLabel, list",prio="P1")
add("core/booking-cta","Booking CTA","Forms",exists=True,loc=CORE,role="cta",desc="Book a call or visit with provider link.",fields="title, body, url, provider")
add("blocks/contact-stack","Contact stack","Forms",exists=True,loc=P("contact-stack"),desc="Address, hours, phone, map and form together.",fields="address, hours[], phone, email, map, form",prio="P1")
add("core/form","Form embed","Forms",dyn=True,resolver="forms.form",desc="Renders a form built in the Forms extension.",fields="form (reference), title override",prio="P0 Flagship",plugin="forms",tier="Plugin")
add("core/lead-magnet","Lead magnet","Forms",role="cta",desc="Download in exchange for email.",fields="title, body, media, file, list")
add("core/poll","Poll","Forms",dyn=True,resolver="forms.poll",desc="Single-question poll with live results.",fields="question, options[], showResults")
add("core/event-rsvp","Event RSVP","Forms",dyn=True,resolver="events.event",role="cta",desc="RSVP form for an event.",fields="event (reference)",plugin="events",tier="Plugin")
# ---- Plugin blocks
for n,t,d,f,pl,res in [
 ("lms/course-grid","Course grid","Courses as cards with progress for signed-in learners.","query, limit, columns","lms","lms.courses"),
 ("lms/curriculum","Curriculum","Module and lesson outline for a course.","course (reference), expanded","lms","lms.curriculum"),
 ("lms/instructor","Instructor","Instructor profile with courses taught.","instructor (reference)","lms","lms.instructor"),
 ("lms/progress","Learner progress","Signed-in learner's progress summary.","course (reference) | all","lms","lms.progress"),
 ("events/calendar","Event calendar","Month or list calendar of events.","view, category, limit","events","events.list"),
 ("events/event-list","Event list","Upcoming events as cards.","limit, category","events","events.list"),
 ("events/next-event","Next event","Spotlight on the next upcoming event.","category","events","events.next"),
 ("membership/plans","Membership plans","Plan cards from the Membership extension.","plans[] (reference) | all","membership","membership.plans"),
 ("membership/gated-teaser","Gated teaser","Preview with an upgrade prompt for gated content.","teaserText, requiredPlan","membership","membership.access"),
 ("gallery/recipe-card","Recipe card","Recipe with ingredients, steps and schema.org markup.","recipe (reference)","gallery-recipes","recipes.recipe"),
 ("gallery/album","Gallery album","Album from the Gallery extension.","album (reference), columns","gallery-recipes","gallery.album"),
 ("support/kb-search","Knowledge base search","Search box over help articles with top results.","placeholder, category","support","support.search"),
 ("support/ticket-cta","Ticket CTA","Open a support ticket.","title, body","support","support.form"),
 ("certificates/verify","Certificate verify","Enter a code to verify a certificate.","title","certificates","certificates.verify"),
]:
    add(n,t,"Plugin",tier="Plugin",dyn=True,resolver=res,desc=d,fields=f,plugin=pl,prio="P1" if n in ("lms/course-grid","events/event-list","membership/plans") else "P2")
# ---- Site & utility
add("core/site-info","Site info","Site",role="utility",desc="Site name, tagline, logo from settings.",fields="show[]")
add("core/menu","Menu","Site",dyn=True,resolver="site.menu",role="utility",desc="Renders a menu location inline.",fields="location | menu (reference), orientation")
add("core/account-teaser","Account teaser","Site",dyn=True,resolver="site.viewer",role="utility",desc="Sign in / dashboard prompt aware of the viewer.",fields="signedOutText, signedInText")
add("core/custom-html","Custom HTML","Site",role="utility",desc="Sanitised HTML (no scripts). The only raw-markup escape hatch.",fields="html",migrates="TipTap html node",notes="DOMPurify server-side and client-side; capability blocks.customHtml.")
add("core/iframe","Iframe","Site",role="utility",desc="Sandboxed iframe for allow-listed hosts.",fields="url, height, title")
add("core/script-embed","Script embed","Site",role="utility",desc="Allow-listed third-party script (chat widget, analytics).",fields="provider, config",notes="Providers registered by integrations; never arbitrary script URLs.")
add("core/anchor-nav","Anchor nav","Site",role="utility",desc="In-page jump links built from block anchors.",fields="auto | items[]")
add("core/language-switcher","Language switcher","Site",role="utility",desc="Locale links when multilingual is enabled.",fields="style")
# ---- existing odd ones
add("blocks/grade-gallery","Grade gallery","Media",exists=True,loc=P("grade-gallery"),desc="Tiered gallery grouping items by grade or level.",fields="groups[{label, items[media]}]",notes="Name may be client-derived; review for a generic rename (e.g. core/tiered-gallery) during Phase 1 migration.")
json.dump(rows,open("rows.json","w"),indent=1)
print(len(rows),"rows;",sum(1 for r in rows if r["Exists Today"]),"existing;",sum(1 for r in rows if r["Priority"]=="P0 Flagship"),"flagship")
from collections import Counter; print(Counter(r["Category"] for r in rows))
