import PDFDocument from "pdfkit";
import type { Quote, QuoteItem, Partner, Organization } from "@shared/schema";
import https from "https";
import http from "http";

interface QuotePdfData {
  quote: Quote;
  items: QuoteItem[];
  partner: Partner;
  organization: Organization & { logoUrl?: string | null };
  issuerPartner?: Partner | null;
}

async function fetchImage(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    try {
      const protocol = url.startsWith('https') ? https : http;
      protocol.get(url, (response) => {
        if (response.statusCode !== 200) {
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', () => resolve(null));
      }).on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

export class PdfService {
  static async generateQuotePdf(data: QuotePdfData): Promise<PDFKit.PDFDocument> {
    const { quote, items, partner, organization, issuerPartner } = data;
    
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      info: {
        Title: `Offerta ${quote.quoteNumber}`,
        Author: organization.name,
      }
    });

    // Map organization theme to colors
    const themeColors: { [key: string]: { primary: string; accent: string } } = {
      blue: { primary: "#1e40af", accent: "#2563eb" },
      green: { primary: "#166534", accent: "#22c55e" },
      purple: { primary: "#6b21a8", accent: "#a855f7" },
      orange: { primary: "#c2410c", accent: "#f97316" },
      red: { primary: "#b91c1c", accent: "#ef4444" },
      pink: { primary: "#be185d", accent: "#ec4899" },
      yellow: { primary: "#a16207", accent: "#eab308" },
      teal: { primary: "#0f766e", accent: "#14b8a6" },
      indigo: { primary: "#4338ca", accent: "#6366f1" },
      gray: { primary: "#374151", accent: "#6b7280" },
    };
    const orgTheme = organization.theme || "blue";
    const colors = themeColors[orgTheme] || themeColors.blue;
    
    const primaryColor = colors.primary;
    const accentColor = colors.accent;
    const grayColor = "#6b7280";
    const lightGray = "#f3f4f6";

    let y = 40;
    let logoHeight = 0;

    // Use partner logo if available, otherwise organization logo
    const logoPath = issuerPartner?.logoUrl || organization.logoUrl;
    if (logoPath) {
      try {
        // Build full URL for relative paths
        const baseUrl = process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : `http://localhost:${process.env.PORT || 5000}`;
        const logoUrl = logoPath.startsWith('http') ? logoPath : `${baseUrl}${logoPath}`;
        console.log("[PDF] Loading logo from:", logoUrl);
        
        const logoBuffer = await fetchImage(logoUrl);
        if (logoBuffer) {
          doc.image(logoBuffer, 40, y, { width: 40 });
          logoHeight = 30;
          console.log("[PDF] Logo loaded successfully");
        } else {
          console.log("[PDF] Logo buffer is null");
        }
      } catch (e) {
        console.error("Error loading logo:", e);
      }
    }

    doc.fontSize(20)
       .fillColor(primaryColor)
       .text("OFFERTA", 40, y, { align: "right" });
    
    y += 28;
    doc.fontSize(11)
       .fillColor(accentColor)
       .text(quote.quoteNumber, 40, y, { align: "right" });

    const headerX = logoHeight > 0 ? 90 : 40;
    y = 40;
    
    // Use partner name/company if available, otherwise organization name
    const issuerName = issuerPartner?.company || issuerPartner?.name || organization.name;
    doc.fontSize(12)
       .fillColor(primaryColor)
       .font("Helvetica-Bold")
       .text(issuerName, headerX, y);
    doc.font("Helvetica");
    
    y += 16;
    if (issuerPartner) {
      doc.fontSize(8)
         .fillColor(grayColor);
      
      if (issuerPartner.street) {
        const address = [
          issuerPartner.street,
          issuerPartner.streetNumber,
        ].filter(Boolean).join(" ");
        doc.text(address, headerX, y);
        y += 10;
      }
      
      if (issuerPartner.city || issuerPartner.postalCode) {
        const cityLine = [
          issuerPartner.postalCode,
          issuerPartner.city,
          issuerPartner.province ? `(${issuerPartner.province})` : null
        ].filter(Boolean).join(" ");
        doc.text(cityLine, headerX, y);
        y += 10;
      }
      
      if (issuerPartner.vatNumber) {
        doc.text(`P.IVA: ${issuerPartner.vatNumber}`, headerX, y);
        y += 10;
      }
      
      if (issuerPartner.fiscalCode) {
        doc.text(`C.F.: ${issuerPartner.fiscalCode}`, headerX, y);
        y += 10;
      }
      
      const contactLine = [issuerPartner.email, issuerPartner.phone].filter(Boolean).join(" | ");
      if (contactLine) {
        doc.text(contactLine, headerX, y);
        y += 10;
      }
    }

    y = Math.max(y, 40 + logoHeight, 115);
    doc.moveTo(40, y).lineTo(555, y).strokeColor("#e5e7eb").stroke();
    y += 15;

    doc.fontSize(8)
       .fillColor(primaryColor)
       .font("Helvetica-Bold")
       .text("DESTINATARIO", 40, y);
    doc.font("Helvetica");
    
    y += 12;
    doc.fontSize(10)
       .fillColor(primaryColor)
       .font("Helvetica-Bold")
       .text(partner.company || partner.name, 40, y);
    
    y += 12;
    doc.font("Helvetica")
       .fontSize(8)
       .fillColor(grayColor);
    
    if (partner.name && partner.company) {
      doc.text(`Att.ne: ${partner.name}`, 40, y);
      y += 10;
    }
    
    if (partner.street) {
      const address = [partner.street, partner.streetNumber].filter(Boolean).join(" ");
      doc.text(address, 40, y);
      y += 10;
    }
    
    if (partner.city || partner.postalCode) {
      const cityLine = [
        partner.postalCode,
        partner.city,
        partner.province ? `(${partner.province})` : null
      ].filter(Boolean).join(" ");
      doc.text(cityLine, 40, y);
      y += 10;
    }
    
    if (partner.vatNumber) {
      doc.text(`P.IVA: ${partner.vatNumber}`, 40, y);
      y += 10;
    }

    const infoBoxY = 115;
    const infoBoxX = 380;
    
    doc.rect(infoBoxX, infoBoxY, 175, 70)
       .fillColor(lightGray)
       .fill();
    
    doc.fontSize(7)
       .fillColor(grayColor)
       .text("Data emissione", infoBoxX + 8, infoBoxY + 8);
    doc.fontSize(9)
       .fillColor(primaryColor)
       .text(formatDate(quote.issueDate), infoBoxX + 8, infoBoxY + 18);
    
    doc.fontSize(7)
       .fillColor(grayColor)
       .text("Valida fino al", infoBoxX + 8, infoBoxY + 35);
    doc.fontSize(9)
       .fillColor(primaryColor)
       .text(formatDate(quote.validTo), infoBoxX + 8, infoBoxY + 45);
    
    doc.fontSize(7)
       .fillColor(grayColor)
       .text("Versione", infoBoxX + 100, infoBoxY + 8);
    doc.fontSize(9)
       .fillColor(primaryColor)
       .text(String(quote.version || 1), infoBoxX + 100, infoBoxY + 18);

    y = Math.max(y + 15, 200);

    const tableTop = y;
    const colX = [40, 60, 230, 280, 330, 385, 445, 510];
    
    doc.rect(40, tableTop, 515, 18)
       .fillColor(primaryColor)
       .fill();
    
    doc.fontSize(7)
       .fillColor("#ffffff")
       .text("#", colX[0] + 3, tableTop + 5)
       .text("Descrizione", colX[1] + 3, tableTop + 5)
       .text("Qtà", colX[2] + 3, tableTop + 5)
       .text("U.M.", colX[3] + 3, tableTop + 5)
       .text("Prezzo", colX[4] + 3, tableTop + 5)
       .text("Sconto", colX[5] + 3, tableTop + 5)
       .text("Importo", colX[6] + 3, tableTop + 5)
       .text("IVA %", colX[7] + 3, tableTop + 5);
    
    y = tableTop + 18;
    
    const sortedItems = [...items].sort((a, b) => a.lineNumber - b.lineNumber);
    
    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];
      const rowHeight = 20;
      
      if (i % 2 === 0) {
        doc.rect(40, y, 515, rowHeight)
           .fillColor("#fafafa")
           .fill();
      }
      
      const descText = item.description.length > 35 
        ? item.description.substring(0, 35) + "..." 
        : item.description;
      
      doc.fontSize(7)
         .fillColor(primaryColor)
         .text(String(item.lineNumber), colX[0] + 3, y + 6)
         .text(descText, colX[1] + 3, y + 6)
         .text(String(item.quantity), colX[2] + 3, y + 6)
         .text((item.unitOfMeasure || "").substring(0, 6), colX[3] + 3, y + 6)
         .text(formatCurrencyShort(parseFloat(item.unitPrice)), colX[4] + 3, y + 6)
         .text(item.discountPercent && parseFloat(item.discountPercent) > 0 ? `${item.discountPercent}%` : "-", colX[5] + 3, y + 6)
         .text(formatCurrencyShort(parseFloat(item.lineTotal)), colX[6] + 3, y + 6)
         .text("22%", colX[7] + 3, y + 6);
      
      y += rowHeight;
      
      if (y > 750) {
        doc.addPage();
        y = 40;
      }
    }

    doc.moveTo(40, y).lineTo(555, y).strokeColor("#e5e7eb").stroke();
    y += 12;

    const totalsX = 400;
    
    doc.fontSize(8)
       .fillColor(grayColor)
       .text("Totale imponibile:", totalsX, y)
       .fillColor(primaryColor)
       .text(formatCurrency(parseFloat(quote.subtotal)), totalsX + 70, y, { align: "right", width: 85 });
    y += 14;
    
    if (quote.discountPercent && parseFloat(quote.discountPercent) > 0) {
      doc.fillColor(grayColor)
         .text(`Sconto (${quote.discountPercent}%):`, totalsX, y)
         .fillColor("#dc2626")
         .text(`-${formatCurrency(parseFloat(quote.discountAmount || "0"))}`, totalsX + 70, y, { align: "right", width: 85 });
      y += 14;
    }
    y += 2;
    
    doc.fillColor(grayColor)
       .text("IVA (22%):", totalsX, y)
       .fillColor(primaryColor)
       .text(formatCurrency(parseFloat(quote.taxes)), totalsX + 70, y, { align: "right", width: 85 });
    y += 16;
    
    doc.rect(totalsX - 5, y - 3, 175, 22)
       .fillColor(primaryColor)
       .fill();
    
    doc.fontSize(10)
       .fillColor("#ffffff")
       .font("Helvetica-Bold")
       .text("TOTALE:", totalsX, y + 3)
       .text(formatCurrency(parseFloat(quote.total)), totalsX + 70, y + 3, { align: "right", width: 95 });
    
    doc.font("Helvetica");
    y += 35;

    if (quote.paymentTerms || quote.deliveryMode || quote.specialConditions) {
      doc.fontSize(9)
         .fillColor(primaryColor)
         .font("Helvetica-Bold")
         .text("Condizioni", 40, y);
      doc.font("Helvetica");
      y += 14;
      
      doc.fontSize(8)
         .fillColor(grayColor);
      
      if (quote.paymentTerms) {
        doc.text(`Pagamento: ${quote.paymentTerms}`, 40, y);
        y += 12;
      }
      
      if (quote.deliveryMode) {
        const deliveryModes: Record<string, string> = {
          "remote": "Remoto",
          "on-site": "Presso il cliente",
          "hybrid": "Ibrido"
        };
        doc.text(`Modalità: ${deliveryModes[quote.deliveryMode] || quote.deliveryMode}`, 40, y);
        y += 12;
      }
      
      if (quote.specialConditions) {
        doc.text(`Note: ${quote.specialConditions}`, 40, y, { width: 515 });
        y += 12;
      }
    }

    if (quote.externalNotes) {
      y += 8;
      doc.fontSize(9)
         .fillColor(primaryColor)
         .font("Helvetica-Bold")
         .text("Note", 40, y);
      doc.font("Helvetica");
      y += 14;
      
      doc.fontSize(8)
         .fillColor(grayColor)
         .text(quote.externalNotes, 40, y, { width: 515 });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      
      doc.fontSize(7)
         .fillColor(grayColor)
         .text(
           `Pagina ${i + 1} di ${pageCount}`,
           40,
           doc.page.height - 30,
           { align: "center", width: doc.page.width - 80 }
         );
    }

    return doc;
  }
}

function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
  }).format(amount);
}

function formatCurrencyShort(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount).replace("€", "").trim() + " €";
}
