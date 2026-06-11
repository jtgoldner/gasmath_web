// COPY: draft — every user-facing string lives in this file so the owner can
// review and rewrite copy in one place. Nothing here is final.

export const COPY = {
  appName: 'GasMath',
  tagline: 'One answer. The cheapest fill-up for you, right now.',

  onboarding: {
    vehicleTitle: 'What do you drive?',
    vehicleHint: 'GasMath uses your EPA mileage and tank size to do the math. Stored on your phone only — no account, ever.',
    dieselNotice: 'Diesel support is coming soon. GasMath prices gasoline only for now.',
    clubsTitle: 'Warehouse club gas',
    clubsHint: "Only members can buy club gas, so GasMath only includes stations you can actually use.",
    costcoLabel: "I'm a Costco member",
    bjsLabel: "I'm a BJ's member",
    topTierTitle: 'Top Tier gas only?',
    topTierHint: 'Top Tier brands certify a higher detergent standard. Recommended on.',
    topTierLabel: 'Only show Top Tier certified stations',
    octaneTitle: 'Prefer high octane?',
    octaneHint: 'When on, GasMath compares premium prices instead of regular.',
    octaneLabel: 'Price against premium fuel',
    next: 'Next',
    back: 'Back',
    finish: 'Start saving',
  },

  home: {
    gaugeTitle: 'How much gas do you need?',
    gallons: (g: string) => `≈ ${g} gallons`,
    find: 'Find my station',
    locating: 'Checking nearby prices…',
    hybridNotice: 'Hybrid Vehicle? Read This First!',
  },

  hybrid: {
    heading: 'A note for hybrid drivers',
    body: "We'll do our best to estimate your gas consumption and deliver a recommendation. But please know there's a much higher degree of error with hybrid vehicles, due to their more complex pattern of gasoline consumption.",
    back: 'Return home',
  },

  verdict: {
    heading: 'Fill up here',
    savings: (station: string, amount: string) =>
      `You'll save ${amount} by going to ${station}.`,
    affirm: 'Good news — your closest station is also your cheapest.',
    fillCost: (cost: string) => `Estimated fill-up: ${cost}`,
    perGallon: (price: string, grade: string) => `${price}/gal ${grade}`,
    distance: (miles: string) => `${miles} mi away`,
    relaxTopTier: 'No Top Tier stations nearby have current prices. Want to see all stations?',
    relaxStaleness: 'No stations nearby have recent prices. Want to include older prices?',
    noStations: "We couldn't find any stations with usable prices near you.",
    showAll: 'Show all stations',
    includeOlder: 'Include older prices',
    back: 'Back',
    // Google policy: Places data shown WITHOUT a map requires the official
    // "Powered by Google" logo (not the "Google Maps" logo). This is the alt
    // text / fallback for that logo image.
    attributionAlt: 'Powered by Google',
  },

  settings: {
    title: 'Settings',
    vehicle: 'Your vehicle',
    clubs: 'Warehouse clubs',
    preferences: 'Fuel preferences',
    done: 'Done',
  },

  errors: {
    fetchFailed: "Something went wrong getting prices. Check your connection and try again.",
    retry: 'Try again',
  },
} as const;

export function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
