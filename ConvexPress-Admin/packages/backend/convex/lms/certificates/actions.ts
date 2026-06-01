"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { isPluginEnabled } from "../../helpers/plugins";
import {
  buildCertificateMergeValues,
  formatCertificateDate,
  renderCertificateText,
} from "./rendering";

export const renderCertificatePdf = internalAction({
  args: { issueId: v.id("lms_certificate_issues") },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(
      (internal as any).lms.certificates.actions.getRenderPayload,
      { issueId: args.issueId },
    );
    if (!payload) {
      return { ok: false, reason: "not_renderable" };
    }

    const bytes = buildPdfBytes({
      certificateTitle: payload.certificateTitle,
      learnerName: payload.learnerName,
      courseTitle: payload.courseTitle,
      issuedDate: formatCertificateDate(payload.issuedAt),
      serial: payload.serial,
      certificateText: payload.certificateText,
      orientation: payload.orientation,
    });
    const fileName = `${slugify(payload.serial)}.pdf`;
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: "application/pdf" }),
    );
    const mediaId = await ctx.runMutation(
      (internal as any).media.internals.createMediaInternal,
      {
        storageId,
        fileName,
        mimeType: "application/pdf",
        fileSize: bytes.byteLength,
        uploadedBy: payload.uploadedBy,
        title: `Certificate ${payload.serial}`,
        description: `LMS certificate for ${payload.learnerName} in ${payload.courseTitle}.`,
      },
    );
    await ctx.runMutation(
      (internal as any).lms.certificates.actions.attachPdfMedia,
      { issueId: args.issueId, mediaId },
    );
    return { ok: true, mediaId };
  },
});

export const getRenderPayload = internalQuery({
  args: { issueId: v.id("lms_certificate_issues") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const issue = await ctx.db.get(args.issueId);
    if (!issue || issue.status !== "issued") return null;
    const [user, course, certificate] = await Promise.all([
      ctx.db.get(issue.userId),
      ctx.db.get(issue.courseId),
      ctx.db.get(issue.certificateId),
    ]);
    if (!course || !certificate) return null;
    const completion = await findCompletion(ctx, issue.userId, issue.courseId);
    const learnerName = user?.displayName ?? user?.email ?? "Unknown";
    const courseTitle = course.title ?? "Unknown course";
    const certificateTitle = certificate.title ?? "Certificate of Completion";
    return {
      uploadedBy: certificate.createdBy as Id<"users">,
      learnerName,
      courseTitle,
      issuedAt: issue.issuedAt,
      serial: issue.serial,
      certificateTitle,
      orientation: certificate.orientation ?? "landscape",
      certificateText: renderCertificateText(certificate.templateDoc, {
        ...buildCertificateMergeValues({
          learnerName,
          courseTitle,
          issuedAt: issue.issuedAt,
          serial: issue.serial,
          certificateTitle,
          points: completion?.pointsEarned ?? course.pointsAwarded,
        }),
      }),
    };
  },
});

export const attachPdfMedia = internalMutation({
  args: {
    issueId: v.id("lms_certificate_issues"),
    mediaId: v.id("media"),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue || issue.status !== "issued") return null;
    await ctx.db.patch(args.issueId, { pdfMediaId: args.mediaId });
    return args.mediaId;
  },
});

async function findCompletion(ctx: any, userId: Id<"users">, courseId: Id<"lms_courses">) {
  const completions = await ctx.db
    .query("lms_course_completions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  return completions.find((completion: any) => completion.courseId === courseId) ?? null;
}

function buildPdfBytes(input: {
  certificateTitle: string;
  learnerName: string;
  courseTitle: string;
  issuedDate: string;
  serial: string;
  certificateText: string;
  orientation: "landscape" | "portrait";
}) {
  const landscape = input.orientation === "landscape";
  const width = landscape ? 792 : 612;
  const height = landscape ? 612 : 792;
  const content = [
    "q",
    "1 w",
    `36 36 ${width - 72} ${height - 72} re S`,
    "BT",
    ...pdfLine(input.certificateTitle, 26, 72, height - 120),
    ...pdfLine(input.learnerName, 34, 72, height - 170),
    ...wrapPdfText(input.certificateText, width - 144).flatMap((line, index) =>
      pdfLine(line, 13, 72, height - 230 - index * 20),
    ),
    ...pdfLine(`Course: ${input.courseTitle}`, 11, 72, 108),
    ...pdfLine(`Issued: ${input.issuedDate}`, 11, 72, 86),
    ...pdfLine(`Serial: ${input.serial}`, 10, 72, 64),
    "ET",
    "Q",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  return new TextEncoder().encode(writePdf(objects));
}

function pdfLine(text: string, size: number, x: number, y: number) {
  return [`/F1 ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `${pdfHexText(text)} Tj`];
}

function wrapPdfText(text: string, maxWidth: number) {
  const maxChars = Math.max(36, Math.floor(maxWidth / 7));
  return text
    .split(/\n+/)
    .flatMap((paragraph) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > maxChars && line) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      if (line) lines.push(line);
      return lines.length > 0 ? lines : [""];
    })
    .slice(0, 12);
}

function pdfHexText(text: string) {
  const bytes = [0xfe, 0xff];
  for (const char of text) {
    const code = char.charCodeAt(0);
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return `<${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}>`;
}

function writePdf(objects: string[]) {
  const chunks: string[] = ["%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n"];
  const offsets: number[] = [];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(byteLength(chunks.join("")));
    chunks.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
  }
  const xrefOffset = byteLength(chunks.join(""));
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  for (const offset of offsets) {
    chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  return chunks.join("");
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "certificate";
}
