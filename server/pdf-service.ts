import PDFDocument from "pdfkit";
import type { Quote, QuoteItem, Partner, Organization } from "@shared/schema";

interface QuotePdfData {
  quote: Quote;
  items: QuoteItem[];
  partner: Partner;
  organization: Organization;
  issuerPartner?: Partner | null;
}

export class PdfService {
  static generateQuotePdf(data: QuotePdfData): PDFKit.PDFDocument {
    const { quote, items, partner, organization, issuerPartner } = data;
    
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `Offerta ${quote.quoteNumber}`,
        Author: organization.name,
      }
    });

    const primaryColor = "#1a365d";
    const accentColor = "#2563eb";
    const grayColor = "#6b7280";
    const lightGray = "#f3f4f6";

    let y = 50;

    doc.fontSize(24)
       .fillColor(primaryColor)
       .text("OFFERTA", 50, y, { align: "right" });
    
    y += 35;
    doc.fontSize(14)
       .fillColor(accentColor)
       .text(quote.quoteNumber, 50, y, { align: "right" });

    y = 50;
    doc.fontSize(16)
       .fillColor(primaryColor)
       .text(organization.name, 50, y);
    
    y += 20;
    if (issuerPartner) {
      doc.fontSize(9)
         .fillColor(grayColor);
      
      if (issuerPartner.street) {
        const address = [
          issuerPartner.street,
          issuerPartner.streetNumber,
        ].filter(Boolean).join(" ");
        doc.text(address, 50, y);
        y += 12;
      }
      
      if (issuerPartner.city || issuerPartner.postalCode) {
        const cityLine = [
          issuerPartner.postalCode,
          issuerPartner.city,
          issuerPartner.province ? `(${issuerPartner.province})` : null
        ].filter(Boolean).join(" ");
        doc.text(cityLine, 50, y);
        y += 12;
      }
      
      if (issuerPartner.vatNumber) {
        doc.text(`P.IVA: ${issuerPartner.vatNumber}`, 50, y);
        y += 12;
      }
      
      if (issuerPartner.fiscalCode) {
        doc.text(`C.F.: ${issuerPartner.fiscalCode}`, 50, y);
        y += 12;
      }
      
      if (issuerPartner.email) {
        doc.text(issuerPartner.email, 50, y);
        y += 12;
      }
      
      if (issuerPartner.phone) {
        doc.text(issuerPartner.phone, 50, y);
        y += 12;
      }
    }

    y = Math.max(y, 130);
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e5e7eb").stroke();
    y += 20;

    doc.fontSize(10)
       .fillColor(primaryColor)
       .text("DESTINATARIO", 50, y);
    
    y += 15;
    doc.fontSize(11)
       .fillColor(primaryColor)
       .font("Helvetica-Bold")
       .text(partner.company || partner.name, 50, y);
    
    y += 15;
    doc.font("Helvetica")
       .fontSize(9)
       .fillColor(grayColor);
    
    if (partner.name && partner.company) {
      doc.text(`Att.ne: ${partner.name}`, 50, y);
      y += 12;
    }
    
    if (partner.street) {
      const address = [partner.street, partner.streetNumber].filter(Boolean).join(" ");
      doc.text(address, 50, y);
      y += 12;
    }
    
    if (partner.city || partner.postalCode) {
      const cityLine = [
        partner.postalCode,
        partner.city,
        partner.province ? `(${partner.province})` : null
      ].filter(Boolean).join(" ");
      doc.text(cityLine, 50, y);
      y += 12;
    }
    
    if (partner.vatNumber) {
      doc.text(`P.IVA: ${partner.vatNumber}`, 50, y);
      y += 12;
    }

    const infoBoxY = 130;
    const infoBoxX = 350;
    
    doc.rect(infoBoxX, infoBoxY, 195, 80)
       .fillColor(lightGray)
       .fill();
    
    doc.fontSize(8)
       .fillColor(grayColor)
       .text("Data emissione", infoBoxX + 10, infoBoxY + 10);
    doc.fontSize(10)
       .fillColor(primaryColor)
       .text(formatDate(quote.issueDate), infoBoxX + 10, infoBoxY + 22);
    
    doc.fontSize(8)
       .fillColor(grayColor)
       .text("Valida fino al", infoBoxX + 10, infoBoxY + 42);
    doc.fontSize(10)
       .fillColor(primaryColor)
       .text(formatDate(quote.validTo), infoBoxX + 10, infoBoxY + 54);
    
    doc.fontSize(8)
       .fillColor(grayColor)
       .text("Versione", infoBoxX + 110, infoBoxY + 10);
    doc.fontSize(10)
       .fillColor(primaryColor)
       .text(String(quote.version || 1), infoBoxX + 110, infoBoxY + 22);

    y = Math.max(y + 20, 240);

    const tableTop = y;
    const colWidths = [30, 200, 50, 70, 70, 75];
    const colX = [50, 80, 280, 330, 400, 470];
    
    doc.rect(50, tableTop, 495, 22)
       .fillColor(primaryColor)
       .fill();
    
    doc.fontSize(8)
       .fillColor("#ffffff")
       .text("#", colX[0] + 5, tableTop + 7)
       .text("Descrizione", colX[1] + 5, tableTop + 7)
       .text("Qtà", colX[2] + 5, tableTop + 7)
       .text("Prezzo Unit.", colX[3] + 5, tableTop + 7)
       .text("Sconto", colX[4] + 5, tableTop + 7)
       .text("Totale", colX[5] + 5, tableTop + 7);
    
    y = tableTop + 22;
    
    const sortedItems = [...items].sort((a, b) => a.lineNumber - b.lineNumber);
    
    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];
      const rowHeight = 25;
      
      if (i % 2 === 0) {
        doc.rect(50, y, 495, rowHeight)
           .fillColor("#fafafa")
           .fill();
      }
      
      doc.fontSize(9)
         .fillColor(primaryColor)
         .text(String(item.lineNumber), colX[0] + 5, y + 8)
         .text(item.description.substring(0, 40), colX[1] + 5, y + 8)
         .text(`${item.quantity} ${item.unitOfMeasure || ""}`, colX[2] + 5, y + 8)
         .text(formatCurrency(parseFloat(item.unitPrice)), colX[3] + 5, y + 8)
         .text(item.discountPercent ? `${item.discountPercent}%` : "-", colX[4] + 5, y + 8)
         .text(formatCurrency(parseFloat(item.lineTotal)), colX[5] + 5, y + 8);
      
      y += rowHeight;
      
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    }

    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e5e7eb").stroke();
    y += 15;

    const totalsX = 380;
    const totalsWidth = 165;
    
    doc.fontSize(9)
       .fillColor(grayColor)
       .text("Subtotale:", totalsX, y)
       .fillColor(primaryColor)
       .text(formatCurrency(parseFloat(quote.subtotal)), totalsX + 80, y, { align: "right", width: 85 });
    y += 18;
    
    if (quote.discountPercent && parseFloat(quote.discountPercent) > 0) {
      doc.fillColor(grayColor)
         .text(`Sconto (${quote.discountPercent}%):`, totalsX, y)
         .fillColor("#dc2626")
         .text(`-${formatCurrency(parseFloat(quote.discountAmount || "0"))}`, totalsX + 80, y, { align: "right", width: 85 });
      y += 18;
    }
    
    doc.fillColor(grayColor)
       .text("IVA (22%):", totalsX, y)
       .fillColor(primaryColor)
       .text(formatCurrency(parseFloat(quote.taxes)), totalsX + 80, y, { align: "right", width: 85 });
    y += 20;
    
    doc.rect(totalsX - 5, y - 3, totalsWidth, 25)
       .fillColor(primaryColor)
       .fill();
    
    doc.fontSize(11)
       .fillColor("#ffffff")
       .font("Helvetica-Bold")
       .text("TOTALE:", totalsX, y + 3)
       .text(formatCurrency(parseFloat(quote.total)), totalsX + 80, y + 3, { align: "right", width: 85 });
    
    doc.font("Helvetica");
    y += 40;

    if (quote.paymentTerms || quote.deliveryMode || quote.specialConditions) {
      y += 10;
      doc.fontSize(10)
         .fillColor(primaryColor)
         .font("Helvetica-Bold")
         .text("Condizioni", 50, y);
      doc.font("Helvetica");
      y += 18;
      
      doc.fontSize(9)
         .fillColor(grayColor);
      
      if (quote.paymentTerms) {
        doc.text(`Termini di pagamento: ${quote.paymentTerms}`, 50, y);
        y += 14;
      }
      
      if (quote.deliveryMode) {
        const deliveryModes: Record<string, string> = {
          "remote": "Remoto",
          "on-site": "Presso il cliente",
          "hybrid": "Ibrido"
        };
        doc.text(`Modalità: ${deliveryModes[quote.deliveryMode] || quote.deliveryMode}`, 50, y);
        y += 14;
      }
      
      if (quote.specialConditions) {
        doc.text(`Note: ${quote.specialConditions}`, 50, y, { width: 495 });
        y += 14;
      }
    }

    if (quote.externalNotes) {
      y += 10;
      doc.fontSize(10)
         .fillColor(primaryColor)
         .font("Helvetica-Bold")
         .text("Note", 50, y);
      doc.font("Helvetica");
      y += 18;
      
      doc.fontSize(9)
         .fillColor(grayColor)
         .text(quote.externalNotes, 50, y, { width: 495 });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      
      doc.fontSize(8)
         .fillColor(grayColor)
         .text(
           `Pagina ${i + 1} di ${pageCount}`,
           50,
           doc.page.height - 40,
           { align: "center", width: doc.page.width - 100 }
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
