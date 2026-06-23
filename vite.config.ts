import { networkInterfaces } from 'node:os'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import forge from 'node-forge'

// getUserMedia (mic access) requires a secure context, which a plain
// http://<lan-ip> origin isn't, so the dev server needs HTTPS even on the
// LAN. A self-signed cert whose Subject Alternative Name only lists DNS
// names (the default for tools like @vitejs/plugin-basic-ssl's `domains`
// option) does NOT satisfy browsers connecting via a bare IP address —
// they specifically require an `IP Address` SAN entry, not a `DNS` one.
// Generating the cert ourselves with real IP-type SANs is what makes
// mobile Safari actually accept the connection instead of refusing to even
// offer a "proceed anyway" option.
function createDevCertificate() {
  const lanAddresses = Object.values(networkInterfaces())
    .flat()
    .filter((addr) => addr?.family === 'IPv4' && !addr.internal)
    .map((addr) => addr!.address)

  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1)

  const attrs = [{ name: 'commonName', value: 'aerotranslate.local' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' }, // DNS
        { type: 7, ip: '127.0.0.1' }, // IP
        ...lanAddresses.map((ip) => ({ type: 7, ip })),
      ],
    },
  ])
  cert.sign(keys.privateKey, forge.md.sha256.create())

  return {
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(keys.privateKey),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    https: createDevCertificate(),
  },
})
