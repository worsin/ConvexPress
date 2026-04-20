export const fullSiteFixture = {
  users: [
    {
      id: 11,
      username: "shop-admin",
      name: "Shop Admin",
      email: "admin@example.test",
      roles: ["administrator"],
    },
  ],
  categories: [
    { id: 21, name: "News", slug: "news", parent: 0 },
    { id: 22, name: "Updates", slug: "updates", parent: 21 },
  ],
  tags: [
    { id: 31, name: "Launch", slug: "launch" },
  ],
  media: [
    {
      id: 41,
      title: { rendered: "Hero" },
      source_url: "https://example.test/wp-content/uploads/hero.jpg",
      media_details: {
        sizes: {
          medium: {
            source_url: "https://example.test/wp-content/uploads/hero-300x200.jpg",
          },
          thumbnail: {
            source_url: "https://example.test/wp-content/uploads/hero-150x150.jpg",
          },
        },
      },
    },
  ],
  posts: [
    {
      id: 51,
      title: { rendered: "Hello World" },
      slug: "hello-world",
      author: 11,
      featured_media: 41,
      categories: [21],
      tags: [31],
      meta: {
        _elementor_data: "[{\"id\":\"hero\"}]",
        _yoast_wpseo_title: "Hello World",
        _edit_lock: "ignore",
      },
    },
  ],
  pages: [
    {
      id: 61,
      title: { rendered: "Home" },
      slug: "home",
      author: 11,
      featured_media: 41,
      parent: 0,
      menu_order: 1,
      meta: {
        _wp_page_template: "front-page.php",
      },
    },
  ],
  comments: [
    {
      id: 71,
      post: 51,
      parent: 0,
      author: 11,
      author_email: "reader@example.test",
      content: { rendered: "Great post." },
    },
  ],
  menus: [
    { id: 81, name: "Primary", slug: "primary", locations: ["primary"] },
  ],
  menuItems: [
    {
      id: 82,
      menus: 81,
      object: "page",
      object_id: 61,
      parent: 0,
      title: { rendered: "Home" },
    },
  ],
  products: [
    {
      id: 91,
      name: "Imported Hoodie",
      slug: "imported-hoodie",
      sku: "HOODIE-001",
      type: "variable",
      categories: [{ id: 101, name: "Apparel", slug: "apparel" }],
      images: [{ id: 41, src: "https://example.test/wp-content/uploads/hero.jpg" }],
      variations: [92],
    },
  ],
  customers: [
    {
      id: 111,
      email: "customer@example.test",
      first_name: "Casey",
      last_name: "Customer",
    },
  ],
  orders: [
    {
      id: 121,
      number: "1001",
      customer_id: 111,
      billing: { email: "customer@example.test" },
      line_items: [{ id: 122, product_id: 91, variation_id: 92, quantity: 1 }],
      coupon_lines: [{ code: "WELCOME10", discount: "10.00" }],
      total: "49.00",
    },
    {
      id: 123,
      number: "1002",
      customer_id: 0,
      billing: {},
      line_items: [{ id: 124, product_id: 91, variation_id: 0, quantity: 1 }],
      total: "59.00",
    },
  ],
  refunds: [
    { id: 131, orderId: 121, amount: "10.00", reason: "Partial return" },
  ],
  coupons: [
    { id: 141, code: "WELCOME10", discount_type: "percent", amount: "10" },
  ],
  reviews: [
    {
      id: 151,
      product_id: 91,
      reviewer: "Casey Customer",
      reviewer_email: "customer@example.test",
      rating: 5,
      review: "Fits well.",
    },
  ],
};
