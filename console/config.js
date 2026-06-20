// THE ELECT — Console config
// Single edit point: add/remove voices here. No other file needs to change.

export const CONFIG = {
  // The live gateway (Cloudflare Worker) — holds the RunPod key, all guardrails.
  gatewayUrl: 'https://elect-gateway.lerugray.workers.dev',

  // When true: no network calls; canned in-voice stubs. Set false to use the
  // live gateway above. (Tag [mock] marks every mock reply.)
  mock: false,

  defaultMaxTokens: 512,

  // Models array — each entry drives the voice picker, disclaimers, and loader.
  // Adding a 6th entry here is the ONLY change needed to add a voice.
  //   codename: the wire `model` value sent to the gateway
  //   display:  shown on the chip and in transcript headers
  //   figure:   used in the per-voice disclaimer line
  //   hue:      accent color for the summoning loader and active chip glow
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
    // Thomas Müntzer is added in the worker config + image, but the live RunPod
    // endpoint is still caching the pre-Müntzer image. Re-add this entry once the
    // endpoint serves muntzergeist (codename:"muntzergeist", hue:"#d2503a").
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
  ],
};
