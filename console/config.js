// THE ELECT — Console config
// Single edit point: add/remove voices here. No other file needs to change.

export const CONFIG = {
  // Set gatewayUrl to the gateway endpoint once it exists.
  // Leave empty and set mock:true to use mock mode.
  gatewayUrl: '',

  // When true: no network calls are made. Canned in-voice stubs are returned
  // after a simulated cold-start delay. Tag [mock] marks every mock reply.
  mock: true,

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
  ],
};
