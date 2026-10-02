import * as dns from 'node:dns/promises';
import * as dnsCallbacks from 'node:dns';
import ipaddr from 'ipaddr.js';
import * as http from 'node:http';
import * as https from 'node:https';

if (process.env.ALLOW_LOCAL_TARGETS === 'true' && process.env.NODE_ENV === 'production') {
  throw new Error("Cannot run in production with ALLOW_LOCAL_TARGETS=true");
}

export function isBlockedIp(ipString: string): boolean {
  if (process.env.ALLOW_LOCAL_TARGETS === 'true') {
    // If we only want to allow localhost, we shouldn't just return false for everything.
    // The prompt says "A dev-only env flag ALLOW_LOCAL_TARGETS may allow localhost for fixtures"
    // So let's allow 127.0.0.1 and ::1. But wait, if they pass this flag, maybe they just want it to bypass?
    // We'll return false for loopback. But let's just use a special check for the loopback and local ranges.
    // Actually, I'll bypass the check completely if the flag is true.
  }

  let ip: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    ip = ipaddr.parse(ipString);
  } catch {
    return true; // Invalid IPs are blocked
  }

  if (ip.kind() === 'ipv6') {
    const ipv6 = ip as ipaddr.IPv6;
    if (ipv6.isIPv4MappedAddress()) {
      ip = ipv6.toIPv4Address();
    }
  }

  if (ip.kind() === 'ipv4') {
    const ipv4 = ip as ipaddr.IPv4;
    const ranges: [string, number][] = [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4]
    ];
    for (const [rIpStr, rCidr] of ranges) {
      const rIp = ipaddr.IPv4.parse(rIpStr);
      if (ipv4.match(rIp, rCidr)) {
        if (process.env.ALLOW_LOCAL_TARGETS === 'true' && rIpStr === '127.0.0.0') return false;
        return true;
      }
    }
    return false;
  } else {
    const ipv6 = ip as ipaddr.IPv6;
    if (ipv6.toNormalizedString() === '0:0:0:0:0:0:0:0') return true;
    if (ipv6.toNormalizedString() === '0:0:0:0:0:0:0:1') {
      if (process.env.ALLOW_LOCAL_TARGETS === 'true') return false;
      return true;
    }

    const ranges: [string, number][] = [
      ['fc00::', 7],
      ['fe80::', 10],
      ['ff00::', 8]
    ];
    for (const [rIpStr, rCidr] of ranges) {
      const rIp = ipaddr.IPv6.parse(rIpStr);
      if (ipv6.match(rIp, rCidr)) {
        return true;
      }
    }
    return false;
  }
}

export async function assertSafeTarget(
  targetUrl: string, 
  resolver: typeof dns.lookup = dns.lookup as any
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error("Invalid scheme");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Credentials in URL");
  }

  if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
    if (process.env.ALLOW_LOCAL_TARGETS !== 'true') {
      throw new Error("Invalid port");
    }
  }

  const hostname = parsed.hostname;
  
  // Custom resolver signature to match dns.promises.lookup or dns.lookup
  let addresses: any[];
  try {
    const res = await resolver(hostname, { all: true } as any);
    if (Array.isArray(res)) {
      addresses = res;
    } else if (res && typeof res === 'object' && 'address' in res) {
      addresses = [res];
    } else {
      addresses = [];
    }
  } catch (err: any) {
    if (err.code === 'ENOTFOUND') {
       throw new Error("Unresolvable hostname");
    }
    throw err;
  }
  
  if (!addresses || addresses.length === 0) {
    throw new Error("No addresses found");
  }

  for (const addr of addresses) {
    // If the resolver returns `{ address: string, family: number }`
    const ip = typeof addr === 'string' ? addr : addr.address;
    if (isBlockedIp(ip)) {
      throw new Error(`Blocked IP resolved: ${ip}`);
    }
  }
}

export function shouldAbortRequest(url: string): boolean {
  // helper for Playwright's page.route later
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
    if (parsed.username || parsed.password) return true;
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
      if (process.env.ALLOW_LOCAL_TARGETS !== 'true') return true;
    }
    // Note: async DNS resolution in page.route requires async handler, but this is a sync helper?
    // We will leave it as true if hostname is a blocked IP literal.
    if (ipaddr.isValid(parsed.hostname) && isBlockedIp(parsed.hostname)) return true;
    return false;
  } catch {
    return true;
  }
}

export async function safeFetch(
  urlStr: string,
  opts: { redirects?: number; resolver?: typeof dns.lookup } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: Buffer; url: string }> {
  const redirects = opts.redirects ?? 0;
  if (redirects > 5) {
    throw new Error("Too many redirects");
  }

  const resolver = opts.resolver || dns.lookup as any;
  await assertSafeTarget(urlStr, resolver);

  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    
    // DNS rebinding protection via custom lookup
    const customLookup = (
      hostname: string, 
      options: dns.LookupOptions, 
      callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
    ) => {
      dnsCallbacks.lookup(hostname, { all: false }, (err, address, family) => {
        if (err) return callback(err, address, family);
        if (isBlockedIp(address)) {
          return callback(new Error("DNS Rebinding detected: IP is blocked") as NodeJS.ErrnoException, address, family);
        }
        callback(null, address, family);
      });
    };

    const reqOpts: http.RequestOptions | https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      protocol: parsed.protocol,
      headers: {
        'User-Agent': 'VibeOrVaporwareBot/1.0'
      },
      lookup: customLookup,
      timeout: 10000 // 10s timeout
    };

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(reqOpts, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        const nextUrl = new URL(res.headers.location, urlStr).toString();
        res.resume(); // drain current response
        safeFetch(nextUrl, { redirects: redirects + 1, resolver })
          .then(resolve)
          .catch(reject);
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_SIZE) {
          res.destroy();
          reject(new Error("Response size exceeded 5 MB"));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        resolve({
          status: res.statusCode || 200,
          headers: res.headers,
          data: Buffer.concat(chunks),
          url: urlStr
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}
