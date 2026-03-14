// Vercel Serverless Function - DSI edirnenehir.dsi.gov.tr Scraper Proxy
// Sunucu tarafinda scrape ederek CORS engelini aser
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TARGET_URL = 'https://edirnenehir.dsi.gov.tr/';

  try {
    const response = await fetch(TARGET_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Referer': 'https://edirnenehir.dsi.gov.tr/'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `DSI sunucusu ${response.status} dondu` });
    }

    const html = await response.text();

    // HTML'den tablo verisini parse et
    const stations = parseStationData(html);

    if (stations.length === 0) {
      return res.status(200).json({ source: 'dsi-live', data: [], warning: 'Tablo verisi bulunamadi' });
    }

    return res.status(200).json({ source: 'dsi-live', data: stations });

  } catch (err) {
    console.error('DSI proxy hatasi:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

function parseStationData(html) {
  const stations = [];
  // Regex ile tablodan satir oku (Node.js'de DOMParser yok)
  // DSI sayfasindaki tipik tablo pattern'i: <tr> icinde istasyon adi, debi degeri
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let rowMatch;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const hourStr = `${now.getHours().toString().padStart(2,'0')}:00`;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const text = cellMatch[1].replace(/<[^>]+>/g, '').trim();
      cells.push(text);
    }
    // Minimum 3 sutun ve ilk sutunda istasyon adi benzeri metin olmali
    if (cells.length >= 3 && cells[0] && isNaN(cells[0].charAt(0))) {
      const debiStr = cells.find(c => /^\d+(\.\d+)?$/.test(c.trim()));
      if (debiStr) {
        stations.push({
          istasyon: cells[0],
          nehir: detectRiver(cells[0]),
          tarih: todayStr,
          saat: hourStr,
          debi: parseFloat(debiStr),
          timestamp: now.getTime()
        });
      }
    }
  }
  return stations;
}

function detectRiver(stationName) {
  const map = {
    'Suakacag': 'Tunca', 'Kirishane': 'Meric', 'Ipsala': 'Meric',
    'Inanl': 'Ergene', 'Luleburgaz': 'Ergene', 'Yeniceg': 'Ergene',
    'Ivoylov': 'Arda', 'Elhova': 'Tunca', 'Harmanl': 'Meric', 'Svilengrad': 'Meric'
  };
  for (const [key, river] of Object.entries(map)) {
    if (stationName.toLowerCase().includes(key.toLowerCase())) return river;
  }
  return 'Diger';
}
