// ── GitHub-based deploy: update data.json in GitHub repo ──────────────────
// Netlify auto-deploys when GitHub repo changes → 100% reliable, no API fights

const https = require('https');

// ── CONFIG: User fills these in admin settings ─────────────────────────────
// These come from the request body, set once in admin panel
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

function ghRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const bodyBuf = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'CAF-Portfolio-Admin/1.0',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {})
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch(e) {
          resolve({ status: res.statusCode, json: {} });
        }
      });
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { data, github_token, github_repo, github_owner } = JSON.parse(event.body);

    if (!github_token || !github_repo || !github_owner) {
      throw new Error('GitHub credentials not configured. Please set them in Admin → Settings.');
    }

    const newContent = JSON.stringify(data, null, 2);
    const newContentB64 = Buffer.from(newContent).toString('base64');
    const filePath = `/repos/${github_owner}/${github_repo}/contents/public/data.json`;

    // Step 1: Get current file SHA (required by GitHub API to update a file)
    const getR = await ghRequest('GET', filePath, null, github_token);
    if (getR.status !== 200) {
      throw new Error(`Could not read data.json from GitHub (${getR.status}). Check your repo name and token.`);
    }
    const currentSha = getR.json.sha;

    // Step 2: Update the file
    const updateR = await ghRequest('PUT', filePath, {
      message: `Update portfolio content - ${new Date().toISOString()}`,
      content: newContentB64,
      sha: currentSha
    }, github_token);

    if (updateR.status !== 200 && updateR.status !== 201) {
      throw new Error(`GitHub update failed (${updateR.status}): ${updateR.json.message || 'Unknown error'}`);
    }

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({
        success: true,
        message: 'data.json updated on GitHub. Netlify will auto-deploy in ~30 seconds.',
        commit: updateR.json.commit?.sha?.slice(0, 8) || 'done',
        url: `https://github.com/${github_owner}/${github_repo}/commits/main`
      })
    };

  } catch (err) {
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
