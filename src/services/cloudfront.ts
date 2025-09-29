import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

const USE_CLOUDFRONT = (process.env.USE_CLOUDFRONT || '').toLowerCase() === 'true';
const CF_DISTRIBUTION_DOMAIN = process.env.CF_DISTRIBUTION_DOMAIN || '';
const CF_PRIVATE_KEY_B64 = process.env.CF_PRIVATE_KEY_B64 || '';
const CF_KEY_PAIR_ID = process.env.CF_KEY_PAIR_ID || '';

function getPrivateKeyPem(): string {
  if (!CF_PRIVATE_KEY_B64) {
    throw new Error('CF_PRIVATE_KEY_B64 is missing');
  }
  let pem: string;
  try {
    pem = Buffer.from(CF_PRIVATE_KEY_B64, 'base64').toString('utf8').trim();
  } catch {
    throw new Error('CF_PRIVATE_KEY_B64 is not valid base64');
  }
  if (!/^-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pem)) {
    throw new Error('Decoded CF_PRIVATE_KEY_B64 is not a PEM private key');
  }
  return pem;
}

export function isCloudFrontEnabled(): boolean {
  return USE_CLOUDFRONT && !!CF_DISTRIBUTION_DOMAIN && !!CF_PRIVATE_KEY_B64 && !!CF_KEY_PAIR_ID;
}

export function signCloudFrontUrl(objectKey: string, expiresInSeconds = 3600): string {
  if (!isCloudFrontEnabled()) {
    throw new Error('CloudFront signing not enabled');
  }
  const url = `https://${CF_DISTRIBUTION_DOMAIN}/${objectKey}`;
  const privateKey = getPrivateKeyPem();
  return getSignedUrl({
    url,
    keyPairId: CF_KEY_PAIR_ID,
    dateLessThan: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    privateKey,
  });
}


