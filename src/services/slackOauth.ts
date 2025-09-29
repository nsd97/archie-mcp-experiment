// Using global fetch (Node.js ≥18) — remove node-fetch dependency

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || '';
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET || '';
const SLACK_OAUTH_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

type SlackOAuthResponse = {
  ok: boolean;
  authed_user?: { id?: string };
  error?: string;
};

export async function exchangeSlackCode(code: string, redirectUri?: string): Promise<{ slackUserId: string }> {
  if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
    throw new Error('Slack OAuth not configured');
  }
  if (!code?.trim()) {
    throw new Error('Missing Slack OAuth code');
  }
  const params = new URLSearchParams();
  params.set('code', code);
  params.set('client_id', SLACK_CLIENT_ID);
  params.set('client_secret', SLACK_CLIENT_SECRET);
  if (redirectUri) {
    params.set('redirect_uri', redirectUri);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(SLACK_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': process.env.npm_package_name
          ? `${process.env.npm_package_name}/${process.env.npm_package_version}`
          : 'slack-oauth-helper',
      },
      body: params.toString(),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('Slack OAuth request timed out');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after') || '0');
    throw new Error(`Slack OAuth rate limited (429). retryAfter=${retryAfter}s`);
  }
  if (!res.ok) {
    throw new Error(`Slack OAuth failed: ${res.status}`);
  }
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok || !data.authed_user?.id) {
    throw new Error(`Slack OAuth error: ${data.error || 'unknown'}`);
  }
  return { slackUserId: data.authed_user.id };
}

