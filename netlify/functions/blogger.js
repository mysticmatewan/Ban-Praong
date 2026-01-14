// netlify/functions/blogger.js
const fetch = require('node-fetch');

const BLOG_ID = process.env.179934764020460068;
const API_KEY = process.env.AIzaSyA_qNSQYlZxUkfJZKy0F9WFxNp3mIpt9PQ;
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '300', 10);

// Simple in-memory cache (cold start per lambda instance)
let cache = {
  ts: 0,
  key: '',
  data: null
};

exports.handler = async function(event) {
  try {
    const params = event.queryStringParameters || {};
    const label = params.label; // optional
    const maxResults = params.max || 5;

    const cacheKey = `${label||'__latest__'}:${maxResults}`;
    const now = Date.now();

    if (cache.key === cacheKey && (now - cache.ts) < CACHE_TTL * 1000 && cache.data) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cache.data)
      };
    }

    // Build Blogger v3 URL
    const base = `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts`;
    const url = new URL(base);
    url.searchParams.set('key', API_KEY);
    url.searchParams.set('maxResults', String(maxResults));
    if (label) url.searchParams.set('labels', label);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text();
      return { statusCode: res.status, body: text };
    }
    const json = await res.json();

    // Normalize minimal fields for client
    const items = (json.items || []).map(p => ({
      id: p.id,
      title: p.title,
      url: p.url || p.selfLink,
      published: p.published,
      updated: p.updated,
      labels: p.labels || [],
      contentSnippet: (p.content || '').replace(/<[^>]+>/g, '').slice(0, 200)
    }));

    cache = { ts: now, key: cacheKey, data: { items } };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${Math.min(CACHE_TTL, 600)}, public`
      },
      body: JSON.stringify({ items })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};