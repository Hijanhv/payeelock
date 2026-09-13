import { readFile } from 'node:fs/promises';
import { createDecipheriv, scryptSync } from 'node:crypto';
import { keccak256 } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

type KeystoreFile = {
  crypto: {
    cipher: string;
    cipherparams: { iv: string };
    ciphertext: string;
    kdf: string;
    kdfparams: { dklen: number; n: number; p: number; r: number; salt: string };
    mac: string;
  };
};

/// @dev Decrypts a Web3 Secret Storage v3 keystore locally so secrets never
///      appear in argv or shell history.
export async function loadKeystoreAccount(
  path: string,
  password: string,
): Promise<PrivateKeyAccount> {
  if (!password) throw new Error('A keystore password is required.');
  const parsed = JSON.parse(await readFile(path, 'utf8')) as KeystoreFile;
  const { cipher, cipherparams, ciphertext, kdf, kdfparams, mac } = parsed.crypto;
  if (cipher !== 'aes-128-ctr' || kdf !== 'scrypt') {
    throw new Error(`Unsupported keystore cipher or kdf: ${cipher}/${kdf}`);
  }
  const derivedKey = scryptSync(password, Buffer.from(kdfparams.salt, 'hex'), kdfparams.dklen, {
    N: kdfparams.n,
    p: kdfparams.p,
    r: kdfparams.r,
    maxmem: 256 * kdfparams.n * kdfparams.r,
  });
  const body = Buffer.from(ciphertext, 'hex');
  const expected = Buffer.from(mac, 'hex');
  const actual = Buffer.from(
    keccak256(Buffer.concat([derivedKey.subarray(16, 32), body])).slice(2),
    'hex',
  );
  if (!expected.equals(actual)) throw new Error('Keystore password is incorrect.');
  const decipher = createDecipheriv(
    'aes-128-ctr',
    derivedKey.subarray(0, 16),
    Buffer.from(cipherparams.iv, 'hex'),
  );
  const privateKey = Buffer.concat([decipher.update(body), decipher.final()]);
  return privateKeyToAccount(`0x${privateKey.toString('hex')}` as `0x${string}`);
}
