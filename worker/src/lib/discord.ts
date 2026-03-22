// ═══════════════════════════════════════════════════════════════════════════════
// Discord Webhook Notifications
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env, DiscordChannel, DiscordEmbed } from '../types/index.js';

export const SITE_URL = 'https://www.challengerun.net';

/** Pick the right Discord webhook URL for the notification type */
export function getWebhookUrl(env: Env, channel: DiscordChannel): string | undefined {
  switch (channel) {
    case 'runs':     return env.DISCORD_WEBHOOK_RUNS;
    case 'games':    return env.DISCORD_WEBHOOK_GAMES;
    case 'profiles': return env.DISCORD_WEBHOOK_PROFILES;
    default:         return env.DISCORD_WEBHOOK_RUNS || env.DISCORD_WEBHOOK_PROFILES || env.DISCORD_WEBHOOK_GAMES;
  }
}

export async function sendDiscordNotification(env: Env, channel: DiscordChannel, embed: DiscordEmbed): Promise<void> {
  const webhookUrl = getWebhookUrl(env, channel);
  if (!webhookUrl) {
    console.warn(`Discord webhook: no URL configured for channel "${channel}"`);
    return;
  }

  try {
    // Discord rejects embeds with empty field values — sanitize them
    if (embed.fields) {
      embed.fields = embed.fields
        .filter(f => f && f.name)
        .map(f => ({ ...f, value: String(f.value || '—').slice(0, 1024) }));
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'CRC Bot',
        embeds: [embed],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`Discord webhook error [${channel}]: ${res.status} ${res.statusText}`, body);
    }
  } catch (err) {
    console.error(`Discord webhook fetch failed [${channel}]:`, err);
  }
}
