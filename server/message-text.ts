import { EmailForwardCleaner } from "./email-forward-cleaner";
import * as cheerio from "cheerio";

/**
 * Extract the best plain-text content for AI analysis.
 * For forwarded emails the stored text `body` is often over-stripped (left with
 * only the forwarder's signature), while the HTML body retains the original
 * content. So prefer HTML: gently strip the forwarder's signature/headers (same
 * as the message view) and convert to text. Fall back to the longer of html-text
 * vs the stored text body.
 */
export function extractAnalysisText(message: { body?: string | null; htmlBody?: string | null }): string {
  const textBody = (message.body || "").trim();
  const html = message.htmlBody;
  if (!html) return textBody;
  try {
    const stripped = EmailForwardCleaner.stripSignaturesAndHeaders(html) || html;
    const $ = cheerio.load(stripped);
    // Preserve line breaks from block elements
    $("br").replaceWith("\n");
    $("p, div, tr, li").append("\n");
    const htmlText = $("body").text().replace(/\n{3,}/g, "\n\n").trim();
    // Use whichever carries more signal
    return htmlText.length >= textBody.length ? htmlText : textBody;
  } catch {
    return textBody;
  }
}
