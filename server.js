const express = require('express');
const geoip = require('geoip-lite');
const { Pool } = require('pg');
require('dotenv').config()

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// If behind a reverse proxy (NGINX, Heroku, Cloudflare), enable trust proxy:
app.set('trust proxy', true);

// Helper: get client's IP
function getClientIp(req) {
  // x-forwarded-for may contain a list: take first
  const xf = req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  return req.socket.remoteAddress;
}

// Simple anonymize: zero last octet of IPv4, or truncate IPv6 (example)
function anonymizeIp(ip) {
  if (!ip) return null;
  // remove port if present (rarely)
  ip = ip.split(':').slice(-1)[0];
  if (ip.includes('.')) {
    // IPv4
    const parts = ip.split('.');
    parts[3] = '0';
    return parts.join('.');
  } else {
    // naive IPv6 truncation
    return ip.split(':').slice(0,4).join(':') + '::';
  }
}

app.get('/', async (req, res) => {
  const ip = getClientIp(req);
  const anonIp = anonymizeIp(ip);
  const geo = geoip.lookup(ip) || {};
  const country = geo.country || 'UNKNOWN';
  const ua = req.headers['user-agent'] || null;
  const now = new Date();

  try {
    await pool.query(
      `INSERT INTO visits (anon_ip, country, user_agent, path, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [anonIp, country, ua, req.path, now]
    );
  } catch (err) {
    console.error('DB error', err);
  }

  res.send(`Hello — your detected country: ${country}`);
});

app.listen(process.env.PORT || 3000, () => console.log(`http://localhost:3000`));
