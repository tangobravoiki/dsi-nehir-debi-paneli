// Vercel Serverless Function - GEOGloWS ECMWF API Proxy
// CORS sorununu server-side'da cözer (2 adimli: reach_id + forecast)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat ve lon parametreleri gerekli' });
  }

  try {
    // Adim 1: Koordinattan reach_id al
    const idUrl = `https://geoglows.ecmwf.int/api/v2/reach_id/?lat=${lat}&lon=${lon}`;
    const idResp = await fetch(idUrl, { signal: AbortSignal.timeout(10000) });
    if (!idResp.ok) {
      return res.status(502).json({ error: `GEOGloWS reach_id hatasi: ${idResp.status}` });
    }
    const idData = await idResp.json();
    if (!idData?.reach_id) {
      return res.status(404).json({ error: 'Bu koordinat icin GEOGloWS reach_id bulunamadi' });
    }

    // Adim 2: Forecast verisi al
    const fcUrl = `https://geoglows.ecmwf.int/api/v2/forecast/?reach_id=${idData.reach_id}&return_format=json`;
    const fcResp = await fetch(fcUrl, { signal: AbortSignal.timeout(15000) });
    if (!fcResp.ok) {
      return res.status(502).json({ error: `GEOGloWS forecast hatasi: ${fcResp.status}` });
    }
    const fcData = await fcResp.json();

    // time_series varsa map et, yoksa alternatif alanlara bak
    let timeSeries = [];
    if (fcData?.time_series) {
      timeSeries = fcData.time_series.map(item => ({
        timestamp: new Date(item.datetime).getTime(),
        date: item.datetime,
        discharge: item.flow
      }));
    } else if (fcData?.datetime && fcData?.flow) {
      timeSeries = fcData.datetime.map((dt, i) => ({
        timestamp: new Date(dt).getTime(),
        date: dt,
        discharge: fcData.flow[i]
      }));
    }

    return res.status(200).json({
      source: 'geoglows',
      reach_id: idData.reach_id,
      data: timeSeries
    });

  } catch (err) {
    console.error('GEOGloWS proxy hatasi:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
