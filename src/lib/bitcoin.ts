// Bitcoin address generation utilities
// Ported from Python implementation

import { loadApiUrl } from './storage';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes: Uint8Array): string {
  let num = BigInt(0);
  for (const byte of bytes) {
    num = num * BigInt(256) + BigInt(byte);
  }
  
  let result = '';
  while (num > 0) {
    const rem = num % BigInt(58);
    num = num / BigInt(58);
    result = ALPHABET[Number(rem)] + result;
  }
  
  // Count leading zeros
  let pad = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      pad++;
    } else {
      break;
    }
  }
  
  return '1'.repeat(pad) + result;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
  return new Uint8Array(hashBuffer);
}

async function ripemd160(data: Uint8Array): Promise<Uint8Array> {
  // Simple RIPEMD-160 implementation
  // For production, use a proper crypto library
  const h0 = 0x67452301;
  const h1 = 0xefcdab89;
  const h2 = 0x98badcfe;
  const h3 = 0x10325476;
  const h4 = 0xc3d2e1f0;

  function f(j: number, x: number, y: number, z: number): number {
    if (j < 16) return x ^ y ^ z;
    if (j < 32) return (x & y) | (~x & z);
    if (j < 48) return (x | ~y) ^ z;
    if (j < 64) return (x & z) | (y & ~z);
    return x ^ (y | ~z);
  }

  function K(j: number): number {
    if (j < 16) return 0x00000000;
    if (j < 32) return 0x5a827999;
    if (j < 48) return 0x6ed9eba1;
    if (j < 64) return 0x8f1bbcdc;
    return 0xa953fd4e;
  }

  function KK(j: number): number {
    if (j < 16) return 0x50a28be6;
    if (j < 32) return 0x5c4dd124;
    if (j < 48) return 0x6d703ef3;
    if (j < 64) return 0x7a6d76e9;
    return 0x00000000;
  }

  const r = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
    3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
    1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
    4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13
  ];

  const rr = [
    5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
    6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
    15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
    8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
    12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11
  ];

  const s = [
    11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
    7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
    11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
    11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
    9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6
  ];

  const ss = [
    8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
    9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
    9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
    15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
    8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11
  ];

  function rol(x: number, n: number): number {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  }

  // Padding
  const ml = data.length * 8;
  const padded = new Uint8Array(((data.length + 72) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, ml >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(ml / 0x100000000), true);

  let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
  let [aa, bb, cc, dd, ee] = [h0, h1, h2, h3, h4];

  for (let i = 0; i < padded.length; i += 64) {
    const X: number[] = [];
    for (let j = 0; j < 16; j++) {
      X[j] = view.getUint32(i + j * 4, true);
    }

    let [A, B, C, D, E] = [a, b, c, d, e];
    let [AA, BB, CC, DD, EE] = [a, b, c, d, e];

    for (let j = 0; j < 80; j++) {
      let T = (A + f(j, B, C, D) + X[r[j]] + K(j)) >>> 0;
      T = (rol(T, s[j]) + E) >>> 0;
      A = E;
      E = D;
      D = rol(C, 10);
      C = B;
      B = T;

      T = (AA + f(79 - j, BB, CC, DD) + X[rr[j]] + KK(j)) >>> 0;
      T = (rol(T, ss[j]) + EE) >>> 0;
      AA = EE;
      EE = DD;
      DD = rol(CC, 10);
      CC = BB;
      BB = T;
    }

    const T = (a + B + CC) >>> 0;
    [a, b, c, d, e] = [
      (h1 + C + DD) >>> 0,
      (h2 + D + EE) >>> 0,
      (h3 + E + AA) >>> 0,
      (h4 + A + BB) >>> 0,
      T
    ];
    [aa, bb, cc, dd, ee] = [a, b, c, d, e];
  }

  const result = new Uint8Array(20);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, a, true);
  resultView.setUint32(4, b, true);
  resultView.setUint32(8, c, true);
  resultView.setUint32(12, d, true);
  resultView.setUint32(16, e, true);
  
  return result;
}

// Simplified secp256k1 point multiplication for demo
// In production, use a proper library like elliptic or noble-secp256k1
const SECP256K1_P = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F');
const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
const SECP256K1_GX = BigInt('0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798');
const SECP256K1_GY = BigInt('0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8');

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = BigInt(1);
  base = base % mod;
  while (exp > 0) {
    if (exp % BigInt(2) === BigInt(1)) {
      result = (result * base) % mod;
    }
    exp = exp / BigInt(2);
    base = (base * base) % mod;
  }
  return result;
}

function modInverse(a: bigint, m: bigint): bigint {
  return modPow(a, m - BigInt(2), m);
}

function pointAdd(
  x1: bigint | null, y1: bigint | null,
  x2: bigint | null, y2: bigint | null
): [bigint | null, bigint | null] {
  if (x1 === null || y1 === null) return [x2, y2];
  if (x2 === null || y2 === null) return [x1, y1];
  
  if (x1 === x2 && y1 === y2) {
    const s = ((BigInt(3) * x1 * x1) * modInverse(BigInt(2) * y1, SECP256K1_P)) % SECP256K1_P;
    const x3 = (s * s - BigInt(2) * x1) % SECP256K1_P;
    const y3 = (s * (x1 - x3) - y1) % SECP256K1_P;
    return [(x3 + SECP256K1_P) % SECP256K1_P, (y3 + SECP256K1_P) % SECP256K1_P];
  }
  
  if (x1 === x2) return [null, null];
  
  const s = ((y2 - y1) * modInverse((x2 - x1 + SECP256K1_P) % SECP256K1_P, SECP256K1_P)) % SECP256K1_P;
  const x3 = (s * s - x1 - x2) % SECP256K1_P;
  const y3 = (s * (x1 - x3) - y1) % SECP256K1_P;
  return [(x3 + SECP256K1_P) % SECP256K1_P, (y3 + SECP256K1_P) % SECP256K1_P];
}

function pointMultiply(k: bigint): [bigint, bigint] {
  let [rx, ry]: [bigint | null, bigint | null] = [null, null];
  let [gx, gy]: [bigint | null, bigint | null] = [SECP256K1_GX, SECP256K1_GY];
  
  while (k > 0) {
    if (k % BigInt(2) === BigInt(1)) {
      [rx, ry] = pointAdd(rx, ry, gx, gy);
    }
    [gx, gy] = pointAdd(gx, gy, gx, gy);
    k = k / BigInt(2);
  }
  
  return [rx!, ry!];
}

function bigIntToBytes(num: bigint, length: number): Uint8Array {
  const hex = num.toString(16).padStart(length * 2, '0');
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function privateKeyToAddress(hexKey: string, compressed: boolean): Promise<string | null> {
  try {
    const privKeyInt = BigInt('0x' + hexKey.padStart(64, '0'));
    const [pubX, pubY] = pointMultiply(privKeyInt);
    
    let pubKey: Uint8Array;
    if (compressed) {
      const prefix = pubY % BigInt(2) === BigInt(0) ? 0x02 : 0x03;
      pubKey = new Uint8Array(33);
      pubKey[0] = prefix;
      pubKey.set(bigIntToBytes(pubX, 32), 1);
    } else {
      pubKey = new Uint8Array(65);
      pubKey[0] = 0x04;
      pubKey.set(bigIntToBytes(pubX, 32), 1);
      pubKey.set(bigIntToBytes(pubY, 32), 33);
    }
    
    const sha256Hash = await sha256(pubKey);
    const ripemd160Hash = await ripemd160(sha256Hash);
    
    const networkByte = new Uint8Array(21);
    networkByte[0] = 0x00;
    networkByte.set(ripemd160Hash, 1);
    
    const checksum1 = await sha256(networkByte);
    const checksum2 = await sha256(checksum1);
    
    const addressBytes = new Uint8Array(25);
    addressBytes.set(networkByte);
    addressBytes.set(checksum2.slice(0, 4), 21);
    
    return encodeBase58(addressBytes);
  } catch (error) {
    console.error('Error converting key:', error);
    return null;
  }
}

export async function validateApiUrl(apiUrl: string): Promise<{ valid: boolean; error?: string }> {
  // Basic URL format check
  try {
    const url = new URL(apiUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'URL must start with http:// or https://' };
    }
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Test with a known Bitcoin address (Satoshi's)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(
      `${apiUrl}/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa/balance`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!response.ok) {
      return { valid: false, error: `API returned status ${response.status}` };
    }
    const data = await response.json();
    if (typeof data.confirmed !== 'number') {
      return { valid: false, error: 'API response missing "confirmed" field' };
    }
    return { valid: true };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { valid: false, error: 'API request timed out' };
    }
    return { valid: false, error: `Cannot reach API: ${err.message}` };
  }
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const apiUrl = loadApiUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(
      `${apiUrl}/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa/balance`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function getBalance(address: string): Promise<number> {
  const apiUrl = loadApiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${apiUrl}/${address}/balance`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new ApiError(`API error: ${response.status}`);
    const data = await response.json();
    if (typeof data.confirmed !== 'number') throw new ApiError('Invalid API response');
    return data.confirmed;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err instanceof ApiError) throw err;
    throw new ApiError(`Network error: ${err.message}`);
  }
}

export function hexToInt(hex: string): bigint {
  return BigInt('0x' + hex);
}

export function intToHex(num: bigint): string {
  return num.toString(16).padStart(64, '0');
}

export function generateRandomKeyInRange(startHex: string, endHex: string): string {
  const start = hexToInt(startHex);
  const end = hexToInt(endHex);
  const range = end - start;
  
  // Generate random bigint in range
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  let random = BigInt(0);
  for (const byte of randomBytes) {
    random = random * BigInt(256) + BigInt(byte);
  }
  
  const randomInRange = start + (random % (range + BigInt(1)));
  return intToHex(randomInRange);
}
