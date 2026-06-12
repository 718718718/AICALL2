export interface CustomerData {
  name?: string;
  名前?: string;
  phone?: string;
  電話番号?: string;
  email?: string;
  メールアドレス?: string;
  company?: string;
  会社名?: string;
  notes?: string;
  備考?: string;
  address?: string;
  住所?: string;
  customer?: string;
  date?: string;
  time?: string;
  duration?: string;
  result?: string;
}

export function parseCSV(text: string): CustomerData[] {
  // Remove BOM if present
  const cleanText = text.replace(/^\uFEFF/, '');
  
  // Split lines and filter empty ones
  const lines = cleanText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return [];

  // Parse headers
  const headers = parseCSVLine(lines[0]);
  const data: CustomerData[] = [];

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: CustomerData = {};

    headers.forEach((header, index) => {
      const value = values[index]?.trim();
      if (!value) return;

      const normalizedHeader = header.toLowerCase().replace(/["\s]/g, '');
      
      if (normalizedHeader.includes('name') || header === '名前' || header === '顧客名') {
        row.customer = value;
        row.name = value;
      } else if (normalizedHeader.includes('phone') || header === '電話番号' || header === 'tel') {
        row.phone = value;
      } else if (normalizedHeader.includes('email') || header === 'メールアドレス' || header === 'mail') {
        row.email = value;
      } else if (normalizedHeader.includes('company') || header === '会社名' || header === '企業') {
        row.company = value;
      } else if (normalizedHeader.includes('note') || header === '備考' || header === 'メモ') {
        row.notes = value;
      } else if (normalizedHeader.includes('address') || header === '住所' || header === '所在地') {
        row.address = value;
      } else if (normalizedHeader.includes('date') || header === '日付' || header === '日時') {
        row.date = value;
      } else if (normalizedHeader.includes('time') || header === '時間' || header === '時刻') {
        row.time = value;
      } else if (normalizedHeader.includes('duration') || header === '期間' || header === '時間') {
        row.duration = value;
      } else if (normalizedHeader.includes('result') || header === '結果' || header === 'ステータス') {
        row.result = value;
      } else {
        (row as any)[header] = value;
      }
    });

    if (Object.keys(row).length > 0) {
      data.push(row);
    }
  }

  return data;
}

// Helper function to properly parse CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

export function formatCustomerForImport(data: CustomerData) {
  return {
    customer: data.customer || data.name || 'Unknown',
    date: data.date || new Date().toISOString().split('T')[0],
    time: data.time || '00:00',
    duration: data.duration || '0',
    result: data.result || '未処理',
    notes: data.notes || '',
    address: data.address || '',
    phone: data.phone || '',
    email: data.email || '',
    company: data.company || ''
  };
}