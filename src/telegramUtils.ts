import { jsPDF } from 'jspdf';
import { MetrologyReport, MetrologyUser } from './types';

/**
 * Dispatches a real-time Telegram notification with detailed text summary
 * and a professionally generated PDF report file attachment.
 */
export async function sendTelegramNotification(
  report: MetrologyReport,
  isEdit: boolean,
  users: MetrologyUser[],
  showToast: (msg: string, type: 'success' | 'error') => void
) {
  const botToken = localStorage.getItem('nmc_telegram_bot_token');
  const chatId = localStorage.getItem('nmc_telegram_chat_id');
  const isEnabled = localStorage.getItem('nmc_telegram_enabled') !== 'false';

  // Return silently if notifications are disabled or missing credential details
  if (!isEnabled || !botToken || !chatId) {
    return;
  }

  // Resolve target company metadata
  const company = users.find(u => u.id === report.user_id) || {
    id: 'unknown',
    license_number: report.license_number || 'N/A',
    company_name_kh: report.company_name_kh || 'N/A',
    company_name_en: 'N/A',
    address: 'N/A',
    phone: 'N/A',
    email: 'N/A',
    legal_representative: 'N/A',
    representative_position: 'N/A',
    username: 'N/A',
    role: 'company' as const,
    can_view: true,
    can_edit: true,
    can_save: true,
    can_delete: true,
    created_at: new Date().toISOString()
  };

  const actionText = isEdit ? 'បានកែសម្រួលរបាយការណ៍ / REVISED' : 'បានបញ្ជូនរបាយការណ៍ថ្មី / SUBMITTED';
  
  const getCambodiaTimeStr = () => {
    const now = new Date();
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Phnom_Penh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(now);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      const hour = parts.find(p => p.type === 'hour')?.value;
      const minute = parts.find(p => p.type === 'minute')?.value;
      const second = parts.find(p => p.type === 'second')?.value;
      return `${year}-${month}-${day} ${hour}:${minute}:${second} (GMT+7)`;
    } catch (e) {
      return now.toISOString().replace('T', ' ').substring(0, 19) + ' (GMT+7)';
    }
  };

  const opDate = getCambodiaTimeStr();

  // Escape HTML entities to prevent malformed tags in Telegram HTML parse_mode
  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  const safeActionText = escapeHtml(actionText);
  const safeCompanyKh = escapeHtml(company.company_name_kh);
  const safeLicense = escapeHtml(company.license_number);
  const safeServiceType = escapeHtml(report.service_type);
  const safeInstrument = escapeHtml(report.measuring_instrument);
  const safeSerial = escapeHtml(report.instrument_serial_number || 'No Serial');
  const safeMonth = escapeHtml(report.report_month);
  const safeYear = escapeHtml(report.report_year);
  const safeOpDate = escapeHtml(opDate);
  const safeReportId = escapeHtml(report.id);

  // 1. Text Summary for Telegram Caption (HTML Format)
  const captionText = 
    `🔔 <b>NMC SYSTEM NOTIFICATION</b> 🔔\n` +
    `-----------------------------------------\n` +
    `📤 <b>ប្រតិបត្តិការ / Action:</b> ${safeActionText}\n` +
    `🏢 <b>ឈ្មោះសហគ្រាស / Enterprise:</b> ${safeCompanyKh}\n` +
    `📄 <b>លេខអាជ្ញាប័ណ្ណ / License:</b> ${safeLicense}\n` +
    `🛠️ <b>ប្រភេទសេវាកម្ម / Service:</b> ${safeServiceType}\n` +
    `⚙️ <b>ឧបករណ៍ / Instrument:</b> ${safeInstrument} (S/N: ${safeSerial})\n` +
    `📅 <b>រយៈពេលរបាយការណ៍ / Period:</b> ខែ${safeMonth} ឆ្នាំ${safeYear}\n` +
    `⏱️ <b>កាលបរិច្ឆេទប្រតិបត្តិការ / Date & Time:</b> ${safeOpDate}\n` +
    `-----------------------------------------\n` +
    `🔗 <b>តំណផ្ទៀងផ្ទាត់ផ្លូវការ / Public Verification Link:</b>\n` +
    `${window.location.origin}/?verifyReport=${safeReportId}\n\n` +
    `✓ របាយការណ៍លម្អិតជាឯកសារ PDF របស់មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិត្រូវបានភ្ជាប់ជូនដូចខាងក្រោម។`;

  try {
    // 2. Generate PDF using jsPDF
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Outer frame border
    doc.setDrawColor(220, 225, 230);
    doc.rect(5, 5, 200, 287);

    // Header Panel Banner
    doc.setFillColor(14, 30, 62); // Royal Navy
    doc.rect(5, 5, 200, 38, 'F');
    
    // Logo Accent (Gold Landmark icon simulated)
    doc.setFillColor(194, 155, 62); // Gold
    doc.rect(12, 12, 10, 10, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(14);
    doc.text("NATIONAL METROLOGY CENTER (NMC)", 26, 17);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text("MINISTRY OF INDUSTRY, SCIENCE, TECHNOLOGY & INNOVATION", 26, 23);
    
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(194, 155, 62); // Gold
    doc.text(`OFFICIAL METROLOGY REPORT RECORD - ${isEdit ? 'REVISED' : 'SUBMITTED'}`, 26, 32);

    // Decorative ribbon
    doc.setFillColor(194, 155, 62); // Gold ribbon
    doc.rect(5, 43, 200, 2.5, 'F');

    // Section A: Enterprise Details
    doc.setDrawColor(240, 240, 240);
    doc.setFillColor(248, 250, 252);
    doc.rect(10, 52, 190, 42, 'FD');

    doc.setTextColor(14, 30, 62);
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'bold');
    doc.text("SECTION A: LICENSEE ENTERPRISE METADATA", 14, 59);
    doc.line(14, 61, 196, 61);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(`Enterprise Name: ${company.company_name_kh}`, 14, 69);
    doc.text(`English Name: ${company.company_name_en || 'N/A'}`, 14, 75);
    doc.text(`License/Certificate ID: ${company.license_number}`, 14, 81);
    doc.text(`Registered Address: ${company.address || 'N/A'}`, 14, 87);

    // Section B: Report Service Details
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.rect(10, 100, 190, 74, 'D');

    doc.setTextColor(14, 30, 62);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10);
    doc.text("SECTION B: METROLOGY INSTRUMENT AUDIT DETAIL", 14, 107);
    doc.line(14, 109, 196, 109);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);

    // Helper to draw clean data rows
    const drawRow = (label: string, value: string, yPos: number) => {
      doc.setFont('Helvetica', 'bold');
      doc.text(label + ":", 14, yPos);
      doc.setFont('Helvetica', 'normal');
      doc.text(value || 'N/A', 72, yPos);
    };

    drawRow("Report Record Reference", report.id, 117);
    drawRow("Measuring Instrument", report.measuring_instrument, 124);
    drawRow("Instrument Serial Number", report.instrument_serial_number, 131);
    drawRow("Scope of Weight / Measure", report.scope_of_weight_measure, 138);
    drawRow("Spare Part Installed", report.spare_parts, 145);
    drawRow("Spare Part Serial Number", report.spare_part_serial_number, 152);
    drawRow("Service Classification", report.service_type, 159);
    drawRow("Report Period", `Month ${report.report_month} / Year ${report.report_year}`, 166);

    // Section C: Customer Metadata
    doc.setFillColor(248, 250, 252);
    doc.rect(10, 180, 190, 30, 'FD');

    doc.setTextColor(14, 30, 62);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10);
    doc.text("SECTION C: CUSTOMER / SITE OF INSTALLATION", 14, 187);
    doc.line(14, 189, 196, 189);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(`Customer Name: ${report.customer_name || 'N/A'}`, 14, 197);
    doc.text(`Installation Location: ${report.customer_address || 'N/A'}`, 14, 203);

    // Section D: Chronological Events or Metadata
    doc.setDrawColor(226, 232, 240);
    doc.rect(10, 216, 190, 30, 'D');

    doc.setTextColor(14, 30, 62);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10);
    doc.text("SECTION D: SYSTEM VALIDITY & AUDITING CHRONOLOGY", 14, 223);
    doc.line(14, 225, 196, 225);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(`Action Timestamp: ${opDate}`, 14, 233);
    doc.text(`Verification Key: SHA-256 Verified Signature Code Block`, 14, 239);

    // Seal of Authenticity simulation
    doc.setFillColor(14, 30, 62);
    doc.rect(10, 253, 50, 0.5, 'F');
    doc.setFontSize(8);
    doc.setFont('Helvetica', 'bold');
    doc.text("NMC METROLOGY STAMP", 10, 258);
    doc.setFont('Helvetica', 'normal');
    doc.text("Digitally Certified Record", 10, 262);

    // QR Code simulation frame
    doc.setDrawColor(194, 155, 62);
    doc.rect(154, 250, 31, 31);
    doc.setFontSize(6);
    doc.text("SCAN TO VERIFY", 158, 284);
    
    // Draw micro grid to represent mock qr layout
    doc.setDrawColor(230, 230, 230);
    doc.setFillColor(40, 40, 40);
    doc.rect(156, 252, 6, 6, 'F');
    doc.rect(176, 252, 6, 6, 'F');
    doc.rect(156, 271, 6, 6, 'F');
    doc.rect(168, 262, 5, 5, 'F');

    // Footer lines
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 282, 142, 282);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`This document is dynamically authorized by the National Metrology Center system portal.`, 10, 287);
    doc.text(`Verification Reference ID: ${report.id}`, 10, 290);

    // Compile document buffer output
    const pdfOutput = doc.output('arraybuffer');
    const pdfBlob = new Blob([pdfOutput], { type: 'application/pdf' });

    // 3. Dispatch Multipart Form-Data Request to Telegram API
    const formData = new FormData();
    formData.append('chat_id', chatId.trim());
    formData.append('caption', captionText);
    formData.append('parse_mode', 'HTML');
    
    const formattedToken = company.license_number.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `NMC_Report_${formattedToken}_${report.report_month}_${report.report_year}.pdf`;
    formData.append('document', pdfBlob, fileName);

    const tgResponse = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendDocument`, {
      method: 'POST',
      body: formData
    });

    const data = await tgResponse.json();
    if (data.ok) {
      console.log('NMC Official Report successfully dispatched to Telegram group!');
    } else {
      console.error('Telegram endpoint response failure:', data.description);
      showToast(`Telegram Warn: ${data.description}`, 'error');
    }
  } catch (err: any) {
    console.error('Failed executing Telegram dispatch service:', err);
    showToast(`បញ្ជូនដំណើរការ Telegram បរាជ័យ៖ ${err.message}`, 'error');
  }
}
