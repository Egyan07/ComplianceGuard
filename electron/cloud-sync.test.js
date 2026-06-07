const { validateServerUrl } = require('./cloud-sync');

// The server URL is user-supplied (renderer) and credentials are POSTed to it,
// so it must be https (http only for localhost) — otherwise an attacker can
// harvest credentials/tokens via an arbitrary or cleartext endpoint.
describe('validateServerUrl', () => {
  it('accepts https URLs and returns the normalized origin', () => {
    expect(validateServerUrl('https://api.example.com')).toBe('https://api.example.com');
    expect(validateServerUrl('https://api.example.com/')).toBe('https://api.example.com');
    expect(validateServerUrl('https://api.example.com:8443/ignored/path')).toBe('https://api.example.com:8443');
  });

  it('allows http only for localhost (dev)', () => {
    expect(validateServerUrl('http://localhost:8000')).toBe('http://localhost:8000');
    expect(validateServerUrl('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
  });

  it('rejects http to a non-localhost host (cleartext credential exfil)', () => {
    expect(() => validateServerUrl('http://evil.example.com')).toThrow();
  });

  it('rejects non-http(s) schemes and garbage', () => {
    expect(() => validateServerUrl('ftp://example.com')).toThrow();
    expect(() => validateServerUrl('file:///etc/passwd')).toThrow();
    expect(() => validateServerUrl('not a url')).toThrow();
    expect(() => validateServerUrl('')).toThrow();
  });
});
