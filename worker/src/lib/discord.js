// ═══════════════════════════════════════════════════════════════════════════════
// DISCORD WEBHOOK
// ═══════════════════════════════════════════════════════════════════════════════

export const SITE_URL = 'https://www.challengerun.net';

/** Pick the right Discord webhook URL for the notification type */
function getWebhookUrl(env, channel) {
  switch (channel) {
    case 'runs':     return env.DISCORD_WEBHOOK_RUNS;
    case 'games':    return env.DISCORD_WEBHOOK_GAMES;
    case 'profiles': return env.DISCORD_WEBHOOK_PROFILES;
    default:         return env.DISCORD_WEBHOOK_RUNS || env.DISCORD_WEBHOOK_PROFILES || env.DISCORD_WEBHOOK_GAMES;
  }
}

export async function sendDiscordNotification(env, channel, embed) {
  const webhookUrl = getWebhookUrl(env, channel);
  if (!webhookUrl) {
    console.warn(`Discord webhook not configured for channel: ${channel}`);
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'CRC Bot',
        embeds: [embed],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`Discord webhook ${channel} failed (${res.status}):`, text);
    }
  } catch (err) {
    console.error('Discord webhook error:', err);
  }
}
