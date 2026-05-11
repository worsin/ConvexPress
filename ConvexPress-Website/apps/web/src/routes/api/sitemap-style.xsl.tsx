/**
 * Sitemap XSL Stylesheet Route
 *
 * Serves an XSL stylesheet that transforms XML sitemaps into
 * human-readable HTML tables when visited directly in a browser.
 *
 * Route: /api/sitemap-style.xsl
 * The web server should rewrite /sitemap-style.xsl -> /api/sitemap-style.xsl.
 *
 * Response:
 *   - Content-Type: text/xsl; charset=utf-8
 *   - Cache-Control: public, max-age=86400, s-maxage=86400 (24 hours)
 *
 * This is static content (no Convex query needed).
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/sitemap-style/xsl")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(xslContent(), {
          status: 200,
          headers: {
            "Content-Type": "text/xsl; charset=utf-8",
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
          },
        });
      },
    },
  },
});

/**
 * XSL stylesheet content for rendering XML sitemaps as styled HTML.
 */
function xslContent(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:html="http://www.w3.org/TR/REC-html40"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <title>XML Sitemap</title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <style type="text/css">
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            color: #333;
            margin: 0;
            padding: 0;
            background: #f8f9fa;
          }
          .header {
            background: #1a1a2e;
            color: #fff;
            padding: 20px 40px;
          }
          .header h1 {
            margin: 0;
            font-size: 20px;
            font-weight: 600;
          }
          .header p {
            margin: 8px 0 0;
            font-size: 13px;
            opacity: 0.8;
          }
          .content {
            padding: 20px 40px;
          }
          .count {
            font-size: 13px;
            color: #666;
            margin-bottom: 16px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: #fff;
            border: 1px solid #e2e8f0;
          }
          th {
            text-align: left;
            padding: 10px 12px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
            background: #f1f5f9;
            border-bottom: 2px solid #e2e8f0;
          }
          td {
            padding: 8px 12px;
            font-size: 13px;
            border-bottom: 1px solid #f1f5f9;
          }
          tr:hover td {
            background: #f8fafc;
          }
          td a {
            color: #2563eb;
            text-decoration: none;
          }
          td a:hover {
            text-decoration: underline;
          }
          .priority-high { color: #16a34a; font-weight: 600; }
          .priority-medium { color: #ca8a04; }
          .priority-low { color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>XML Sitemap</h1>
          <p>This is an XML sitemap, meant for consumption by search engines.</p>
        </div>
        <div class="content">
          <xsl:choose>
            <xsl:when test="//sitemap:sitemapindex">
              <p class="count">
                This sitemap index contains <strong><xsl:value-of select="count(sitemap:sitemapindex/sitemap:sitemap)"/></strong> sitemaps.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Sitemap</th>
                    <th>Last Modified</th>
                  </tr>
                </thead>
                <tbody>
                  <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
                    <tr>
                      <td>
                        <a>
                          <xsl:attribute name="href"><xsl:value-of select="sitemap:loc"/></xsl:attribute>
                          <xsl:value-of select="sitemap:loc"/>
                        </a>
                      </td>
                      <td><xsl:value-of select="concat(substring(sitemap:lastmod,0,11),' ',substring(sitemap:lastmod,12,5))"/></td>
                    </tr>
                  </xsl:for-each>
                </tbody>
              </table>
            </xsl:when>
            <xsl:otherwise>
              <p class="count">
                This sitemap contains <strong><xsl:value-of select="count(sitemap:urlset/sitemap:url)"/></strong> URLs.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Priority</th>
                    <th>Change Freq</th>
                    <th>Last Modified</th>
                  </tr>
                </thead>
                <tbody>
                  <xsl:for-each select="sitemap:urlset/sitemap:url">
                    <tr>
                      <td>
                        <a>
                          <xsl:attribute name="href"><xsl:value-of select="sitemap:loc"/></xsl:attribute>
                          <xsl:value-of select="sitemap:loc"/>
                        </a>
                      </td>
                      <td>
                        <xsl:choose>
                          <xsl:when test="sitemap:priority &gt;= 0.7">
                            <span class="priority-high"><xsl:value-of select="sitemap:priority"/></span>
                          </xsl:when>
                          <xsl:when test="sitemap:priority &gt;= 0.4">
                            <span class="priority-medium"><xsl:value-of select="sitemap:priority"/></span>
                          </xsl:when>
                          <xsl:otherwise>
                            <span class="priority-low"><xsl:value-of select="sitemap:priority"/></span>
                          </xsl:otherwise>
                        </xsl:choose>
                      </td>
                      <td><xsl:value-of select="sitemap:changefreq"/></td>
                      <td><xsl:value-of select="concat(substring(sitemap:lastmod,0,11),' ',substring(sitemap:lastmod,12,5))"/></td>
                    </tr>
                  </xsl:for-each>
                </tbody>
              </table>
            </xsl:otherwise>
          </xsl:choose>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>`;
}
