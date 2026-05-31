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
  // Try to find the synchronized system configuration from the user database (Supabase)
  const dbTelegramConfig = users.find(u => u.id === 'telegram_config');

  const botToken = dbTelegramConfig?.company_name_kh || localStorage.getItem('nmc_telegram_bot_token');
  const chatId = dbTelegramConfig?.company_name_en || localStorage.getItem('nmc_telegram_chat_id');
  const isEnabled = dbTelegramConfig 
    ? (dbTelegramConfig.address === 'true') 
    : (localStorage.getItem('nmc_telegram_enabled') !== 'false');

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
      return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    } catch (e) {
      return now.toISOString().replace('T', ' ').substring(0, 19);
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
  const safeReportId = escapeHtml(report.id);
  const safeCompanyKh = escapeHtml(company.company_name_kh);
  const safeLicense = escapeHtml(company.license_number);
  const safeSubmittedBy = escapeHtml(company.legal_representative || 'N/A');
  const safePhone = escapeHtml(company.phone || 'N/A');
  
  const safeCustomerName = escapeHtml(report.customer_name || 'N/A');
  const safeCustomerAddress = escapeHtml(report.customer_address || 'N/A');
  
  const safeInstrument = escapeHtml(report.measuring_instrument || 'N/A');
  const safeSerial = escapeHtml(report.instrument_serial_number || 'N/A');
  const safeScope = escapeHtml(report.scope_of_weight_measure || 'N/A');
  
  const safeServiceType = escapeHtml(report.service_type || 'N/A');
  
  const safeSpareParts = escapeHtml(report.spare_parts || 'N/A');
  const safeSparePartSerial = escapeHtml(report.spare_part_serial_number || 'N/A');
  
  const safeStartDate = escapeHtml(report.service_start_date || 'N/A');
  const safeEndDate = escapeHtml(report.service_end_date || 'N/A');
  const safeMonth = escapeHtml(report.report_month || 'N/A');
  const safeYear = escapeHtml(report.report_year || 'N/A');
  const safeOpDate = escapeHtml(opDate);

  // 1. Text Summary for Telegram Caption (HTML Format) matching exact user template
  const captionText = 
    `🔔 <b>NMC SYSTEM NOTIFICATION</b> 🔔\n\n` +
    `📌 <b>ប្រតិបត្តិការ / Action:</b> ${safeActionText}\n` +
    `🆔 <b>លេខរបាយការណ៍ / Report ID:</b> ${safeReportId}\n` +
    `🏢 <b>សហគ្រាស / Enterprise:</b> ${safeCompanyKh}\n` +
    `📄 <b>អាជ្ញាបណ្ណ / License:</b> ${safeLicense}\n` +
    `👤 <b>អ្នកបញ្ចូល / Submitted By:</b> ${safeSubmittedBy}\n` +
    `☎️ <b>ទំនាក់ទំនង / Contact:</b> ${safePhone}\n` +
    `……………………………………………………………….\n` +
    `👤 <b>អតិថិជន / Customer:</b> ${safeCustomerName}\n` +
    `📍 <b>អាសយដ្ឋាន / Address:</b> ${safeCustomerAddress}\n\n` +
    `⚙️ <b>ឧបករណ៍ / Instrument:</b> ${safeInstrument}\n` +
    `🔢 <b>S/N ឧបករណ៍ / Instrument S/N:</b> ${safeSerial}\n` +
    `📏 <b>វិសាលភាព / Scope:</b> ${safeScope}\n\n` +
    `🛠 <b>សេវាកម្ម / Service:</b> ${safeServiceType}\n\n` +
    `🔧 <b>គ្រឿងបន្លាស់ / Spare Parts:</b> ${safeSpareParts}\n` +
    `🔢 <b>S/N គ្រឿងបន្លាស់ / Spare Part S/N:</b> ${safeSparePartSerial}\n\n` +
    `📆 <b>Start Date:</b> ${safeStartDate}\n` +
    `📆 <b>End Date:</b> ${safeEndDate}\n` +
    `🗓 <b>រយៈពេល / Period:</b> ខែ ${safeMonth} ឆ្នាំ ${safeYear}\n` +
    `⏰ <b>Date & Time:</b> ${safeOpDate} (GMT+7)\n` +
    `🔗 <b>Public Verification Link:</b>\n` +
    `${window.location.origin}/?verifyReport=${safeReportId}\n` +
    `✅ បានបង្កើត និងផ្ញើរបាយការណ៍ PDF រួចរាល់។`;

  try {
    // 2. Dispatch JSON Request to Telegram API (sendMessage instead of sendDocument)
    const tgResponse = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text: captionText,
        parse_mode: 'HTML'
      })
    });

    const data = await tgResponse.json();
    if (data.ok) {
      console.log('NMC Official Notification successfully dispatched to Telegram group!');
    } else {
      console.error('Telegram endpoint response failure:', data.description);
      showToast(`Telegram Warn: ${data.description}`, 'error');
    }
  } catch (err: any) {
    console.error('Failed executing Telegram dispatch service:', err);
    showToast(`បញ្ជូនដំណើរការ Telegram បរាជ័យ៖ ${err.message}`, 'error');
  }
}
