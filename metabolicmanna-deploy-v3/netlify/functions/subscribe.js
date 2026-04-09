// Netlify serverless function: subscribe.js
// Accepts form submission → adds contact to Systeme.io → returns success
// Environment variables required (set in Netlify dashboard → Site settings → Environment variables):
//   SYSTEME_API_KEY  — your Systeme.io public API key
//   SYSTEME_TAG_ID   — the numeric ID of the tag that triggers your welcome automation

exports.handler = async function (event) {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // CORS headers so the browser can call this from your domain
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let email;
  try {
    const body = JSON.parse(event.body || '{}');
    email = (body.email || '').trim().toLowerCase();
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!email || !email.includes('@')) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid email required' }) };
  }

  const apiKey = process.env.SYSTEME_API_KEY;
  const tagId  = process.env.SYSTEME_TAG_ID;

  if (!apiKey) {
    console.error('SYSTEME_API_KEY not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    // Step 1: Create or update contact in Systeme.io
    const contactRes = await fetch('https://api.systeme.io/api/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        email,
        locale: 'en',
        fields: [],
      }),
    });

    const contactData = await contactRes.json();

    if (!contactRes.ok && contactRes.status !== 409) {
      // 409 = contact already exists, that's fine
      console.error('Systeme.io contact error:', contactRes.status, contactData);
      // Still return success to user — don't block the download
    }

    // Step 2: Add tag to trigger automation (if SYSTEME_TAG_ID is set)
    if (tagId && contactData && contactData.id) {
      const tagRes = await fetch(`https://api.systeme.io/api/contacts/${contactData.id}/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ tagId: parseInt(tagId, 10) }),
      });

      if (!tagRes.ok) {
        const tagErr = await tagRes.json().catch(() => ({}));
        console.warn('Tag assignment warning:', tagRes.status, tagErr);
        // Non-fatal — contact was created, automation may still trigger
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };

  } catch (err) {
    console.error('Subscribe function error:', err);
    // Return success anyway — never block the download over a server error
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, note: 'Contact capture had an issue but download is available' }),
    };
  }
};
