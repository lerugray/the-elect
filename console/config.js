// THE ELECT — Console config
// Single edit point: add/remove voices here. No other file needs to change.

// ── DONOR UNLOCK FLAG ──────────────────────────────────────────────────────
// When false (default): console is IDENTICAL to the live version. No patron UI,
// no token field, nothing. Flip to true ONLY after the backend is deployed and
// smoke-tested (see the-elect-private/console/gateway/src/membership.js runbook).
// 2026-06-21: backend verified live — /verify-token returns {ok:true,tier:patron}
// for the real donation token (read from ELECT_TOKENS KV); all 8 patron voices in
// the gateway ALLOWED_MODELS. The earlier "token not stored" was a misdiagnosis.
export const ENABLE_DONOR_UNLOCK = true;

export const CONFIG = {
  // The live gateway (Cloudflare Worker) — holds the RunPod key, all guardrails.
  gatewayUrl: 'https://elect-gateway.lerugray.workers.dev',

  // When true: no network calls; canned in-voice stubs. Set false to use the
  // live gateway above. (Tag [mock] marks every mock reply.)
  mock: false,

  defaultMaxTokens: 768,

  // Free-tier voices — available to all users. This is the current live set.
  // codename: the wire `model` value sent to the gateway
  // display:  shown on the chip and in transcript headers
  // figure:   used in the per-voice disclaimer line
  // hue:      accent color for the summoning loader and active chip glow
  models: [
    {
      codename: 'the-galilean',
      display: 'The Galilean',
      figure: 'Jesus of Nazareth (measured)',
      hue: '#e8cc7a',
    },
    {
      codename: 'den-of-thieves',
      display: 'Den of Thieves',
      figure: 'Jesus of Nazareth (radical)',
      hue: '#e0564e',
    },
    {
      codename: 'muntzergeist',
      display: 'Thomas Müntzer',
      figure: 'Thomas Müntzer',
      hue: '#d2503a',
    },
    {
      codename: 'spectre',
      display: 'Karl Marx',
      figure: 'Karl Marx',
      hue: '#cf5048',
    },
    {
      codename: 'osawatomie',
      display: 'John Brown',
      figure: 'John Brown',
      hue: '#c9b27a',
    },
    {
      codename: 'north-star',
      display: 'Frederick Douglass',
      figure: 'Frederick Douglass',
      hue: '#9fb2c6',
    },
    {
      codename: 'melian',
      display: 'Thucydides',
      figure: 'Thucydides of Athens',
      hue: '#a8946a',
    },
  ],

  // Patron-tier voices — full served roster (free + patron), unlocked for donors.
  // NOT active until ENABLE_DONOR_UNLOCK = true AND backend deployed.
  modelsPatron: [
    // All 7 free voices carry over
    {
      codename: 'the-galilean',
      display: 'The Galilean',
      figure: 'Jesus of Nazareth (measured)',
      hue: '#e8cc7a',
    },
    {
      codename: 'den-of-thieves',
      display: 'Den of Thieves',
      figure: 'Jesus of Nazareth (radical)',
      hue: '#e0564e',
    },
    {
      codename: 'muntzergeist',
      display: 'Thomas Müntzer',
      figure: 'Thomas Müntzer',
      hue: '#d2503a',
    },
    {
      codename: 'spectre',
      display: 'Karl Marx',
      figure: 'Karl Marx',
      hue: '#cf5048',
    },
    {
      codename: 'osawatomie',
      display: 'John Brown',
      figure: 'John Brown',
      hue: '#c9b27a',
    },
    {
      codename: 'north-star',
      display: 'Frederick Douglass',
      figure: 'Frederick Douglass',
      hue: '#9fb2c6',
    },
    {
      codename: 'melian',
      display: 'Thucydides',
      figure: 'Thucydides of Athens',
      hue: '#a8946a',
    },
    // Patron-only additions — require gateway ALLOWED_MODELS update before deploying
    {
      codename: 'abraxas',
      display: 'Abraxas',
      figure: 'Abraxas (Gnostic demiurge)',
      hue: '#b894d4',
    },
    {
      codename: 'the-burrow',
      display: 'Franz Kafka',
      figure: 'Franz Kafka',
      hue: '#8fa89e',
    },
    {
      codename: 'junius',
      display: 'Rosa Luxemburg',
      figure: 'Rosa Luxemburg',
      hue: '#c84040',
    },
    {
      codename: 'red-virgin',
      display: 'Louise Michel',
      figure: 'Louise Michel',
      hue: '#c84060',
    },
    {
      codename: 'mother-earth',
      display: 'Emma Goldman',
      figure: 'Emma Goldman',
      hue: '#8faa60',
    },
    {
      codename: 'tailor-king',
      display: 'Jan van Leiden',
      figure: 'Jan van Leiden',
      hue: '#c8a040',
    },
    {
      codename: 'clausewitz',
      display: 'Clausewitz',
      figure: 'Carl von Clausewitz',
      hue: '#8090a8',
    },
    {
      codename: 'nyarlathotep',
      display: 'Nyarlathotep',
      figure: 'Nyarlathotep (Lovecraft)',
      hue: '#604060',
    },
    {
      codename: 'the-voices',
      display: 'The Voices',
      figure: 'Joan of Arc (trial at Rouen, 1431)',
      hue: '#ead27a',
    },
    {
      codename: 'eschaton',
      display: 'Eschaton',
      figure: 'Illuminatus! (Discordian oracle)',
      hue: '#7fb069',
    },
  ],
};
