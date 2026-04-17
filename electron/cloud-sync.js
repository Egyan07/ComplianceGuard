/**
 * Cloud Sync for ComplianceGuard Electron App
 *
 * Handles authentication and compliance snapshot upload to the web server.
 * Config stored in SQLite via database.getUserSetting/setUserSetting.
 * Uses Node.js 18 built-in fetch (Electron 28).
 */

const KEYS = {
  SERVER_URL: 'cloud_server_url',
  EMAIL: 'cloud_email',
  ACCESS_TOKEN: 'cloud_access_token',
  REFRESH_TOKEN: 'cloud_refresh_token',
};

async function cloudConnect(database, serverUrl, email, password) {
  try {
    const url = serverUrl.replace(/\/$/, '');
    const res = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: body.detail || `Login failed (${res.status})` };
    }

    const data = await res.json();
    await database.setUserSetting(KEYS.SERVER_URL, url, 'string');
    await database.setUserSetting(KEYS.EMAIL, email, 'string');
    await database.setUserSetting(KEYS.ACCESS_TOKEN, data.access_token, 'string');
    await database.setUserSetting(KEYS.REFRESH_TOKEN, data.refresh_token, 'string');

    return { connected: true, email, serverUrl: url };
  } catch (err) {
    return { error: err.message || 'Network error connecting to server' };
  }
}

async function cloudSync(database, syncData) {
  const serverUrl = await database.getUserSetting(KEYS.SERVER_URL, null);
  const accessToken = await database.getUserSetting(KEYS.ACCESS_TOKEN, null);
  const refreshToken = await database.getUserSetting(KEYS.REFRESH_TOKEN, null);

  if (!serverUrl || !accessToken) {
    return { error: 'Not connected to cloud. Configure Cloud Sync in Settings.' };
  }

  const os = require('os');
  const payload = {
    hostname: syncData.hostname || os.hostname(),
    os_version: `${os.type()} ${os.release()}`,
    overall_score: syncData.overall_score ?? null,
    compliance_level: syncData.compliance_level ?? null,
    evidence_count: syncData.evidence_count ?? null,
    agent_version: syncData.agent_version || '2.9.0',
  };

  const result = await _postSync(serverUrl, accessToken, payload);

  if (result.status === 401 && refreshToken) {
    const newToken = await _refreshAccessToken(serverUrl, refreshToken);
    if (newToken) {
      await database.setUserSetting(KEYS.ACCESS_TOKEN, newToken, 'string');
      return _postSync(serverUrl, newToken, payload);
    }
    return { error: 'Session expired. Reconnect in Settings > Cloud Sync.' };
  }

  return result;
}

async function _postSync(serverUrl, accessToken, payload) {
  try {
    const res = await fetch(`${serverUrl}/api/v1/machines/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) return { status: 401 };
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: body.detail || `Sync failed (${res.status})` };
    }

    return res.json();
  } catch (err) {
    return { error: err.message || 'Network error during sync' };
  }
}

async function _refreshAccessToken(serverUrl, refreshToken) {
  try {
    const res = await fetch(`${serverUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

async function getCloudConfig(database) {
  const serverUrl = await database.getUserSetting(KEYS.SERVER_URL, null);
  const email = await database.getUserSetting(KEYS.EMAIL, null);
  const connected = !!(serverUrl && email);
  return { connected, serverUrl, email };
}

async function clearCloudConfig(database) {
  for (const key of Object.values(KEYS)) {
    await database.setUserSetting(key, '', 'string');
  }
  return { disconnected: true };
}

module.exports = { cloudConnect, cloudSync, getCloudConfig, clearCloudConfig };
