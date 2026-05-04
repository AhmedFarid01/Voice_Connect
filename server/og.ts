import type { Express, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { db } from "@db";
import { videos, users, broadcasts } from "@db/schema";
import { eq } from "drizzle-orm";

const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

interface OgContent {
  title: string;
  description: string;
  image: string | null;
  type: "website" | "video.other";
  url: string;
}

function ogBlock(c: OgContent) {
  const tags = [
    `<title>${escape(c.title)}</title>`,
    `<meta name="description" content="${escape(c.description)}" />`,
    `<meta property="og:site_name" content="Lumen" />`,
    `<meta property="og:type" content="${c.type}" />`,
    `<meta property="og:title" content="${escape(c.title)}" />`,
    `<meta property="og:description" content="${escape(c.description)}" />`,
    `<meta property="og:url" content="${escape(c.url)}" />`,
  ];
  if (c.image) {
    tags.push(`<meta property="og:image" content="${escape(c.image)}" />`);
    tags.push(`<meta name="twitter:image" content="${escape(c.image)}" />`);
  }
  tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
  tags.push(`<meta name="twitter:title" content="${escape(c.title)}" />`);
  tags.push(`<meta name="twitter:description" content="${escape(c.description)}" />`);
  return tags.join("\n    ");
}

function injectOg(html: string, c: OgContent) {
  return html.replace(/<!-- OG -->[\s\S]*?<!-- \/OG -->/, `<!-- OG -->\n    ${ogBlock(c)}\n    <!-- /OG -->`);
}

function publicBase(req: Request) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
}

function isBot(req: Request) {
  // Save the work for human page loads — they don't need server-rendered meta.
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  return /bot|crawl|slurp|spider|preview|facebookexternalhit|whatsapp|telegram|twitter|discord|slackbot|linkedinbot/i.test(
    ua,
  );
}

/**
 * Mount before the SPA catch-all. For /watch/:id and /live/:id, fetch metadata
 * and rewrite the OG block in index.html so social-link previews work.
 */
export function mountOgRoutes(app: Express, distPath: string) {
  const indexFile = path.resolve(distPath, "index.html");

  const renderHtml = async (req: Request, res: Response, c: OgContent) => {
    try {
      const tpl = await fs.promises.readFile(indexFile, "utf-8");
      res.status(200).type("html").send(injectOg(tpl, c));
    } catch (err) {
      console.error("[og] render failed:", err);
      res.sendFile(indexFile);
    }
  };

  app.get("/watch/:id", async (req, res, next) => {
    if (!isBot(req)) return next(); // SPA handles humans
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return next();
    try {
      const [row] = await db
        .select({
          title: videos.title,
          description: videos.description,
          thumbnail: videos.thumbnail,
          username: users.username,
          displayName: users.displayName,
        })
        .from(videos)
        .innerJoin(users, eq(videos.userId, users.id))
        .where(eq(videos.id, id))
        .limit(1);
      if (!row) return next();

      const author = row.displayName || row.username;
      const url = `${publicBase(req)}/watch/${id}`;
      const image = row.thumbnail
        ? row.thumbnail.startsWith("http")
          ? row.thumbnail
          : `${publicBase(req)}${row.thumbnail}`
        : `${publicBase(req)}/icon-512.svg`;

      await renderHtml(req, res, {
        title: `${row.title} — ${author} on Lumen`,
        description: row.description?.slice(0, 200) || `Watch ${author}'s video on Lumen.`,
        image,
        type: "video.other",
        url,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/live/:id", async (req, res, next) => {
    if (!isBot(req)) return next();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return next();
    try {
      const [row] = await db
        .select({
          title: broadcasts.title,
          description: broadcasts.description,
          username: users.username,
          displayName: users.displayName,
        })
        .from(broadcasts)
        .innerJoin(users, eq(broadcasts.hostId, users.id))
        .where(eq(broadcasts.id, id))
        .limit(1);
      if (!row) return next();

      const host = row.displayName || row.username;
      const url = `${publicBase(req)}/live/${id}`;

      await renderHtml(req, res, {
        title: `${host} is live: ${row.title}`,
        description: row.description?.slice(0, 200) || `${host} is broadcasting live on Lumen.`,
        image: `${publicBase(req)}/icon-512.svg`,
        type: "video.other",
        url,
      });
    } catch (err) {
      next(err);
    }
  });
}
