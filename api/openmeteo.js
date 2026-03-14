// Vercel Serverless Function - Open-Meteo Flood API Proxy
// CORS sorununu server-side'da çözer
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat ve lon parametreleri gerekli' });
  }

  // Grid search: merkez + 4 offset (+-0.04 derece)
  const offsets = [[0, 0], [0.04, 0], [-0.04, 0], [0, 0.04], [0, -0.04]];

  for (const [dLat, dLon] of offsets) {
    const searchLat = (parseFloat(lat) + dLat).toFixed(4);
    const searchLon = (parseFloat(lon) + dLon).toFixed(4);
    const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${searchLat}&longitude=${searchLon}&daily=river_discharge&past_days=2&forecast_days=1`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) continue;
      const data = await response.json();
      if (data?.daily?.river_discharge) {
        return res.status(200).json({
          source: 'open-meteo',
          lat: searchLat,
          lon: searchLon,
          data: data.daily.time.map((date, i) => ({
            timestamp: new Date(date).getTime(),
            date,
            discharge: data.daily.river_discharge[i]
          }))
        });
      }
    } catch (err) {
      console.warn(`OM grid ${searchLat},${searchLon} hatasi:`, err.message);
    }
  }

  return res.status(404).json({ error: 'Bu koordinat icin Open-Meteo verisi bulunamadi' });
}
