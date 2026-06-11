# Google attribution assets

The verdict screen shows Google Places data **without a map**, which under the
Google Maps Platform terms requires the official **"Powered by Google"** logo
displayed alongside that data (not the "Google Maps" logo — that's for views
that render an actual Google map).

Drop the official asset here so the verdict screen uses it instead of the text
fallback:

- `powered-by-google-on-non-white.png` — the **white logo for dark backgrounds**,
  referenced by [src/ui/verdict.ts](../../src/ui/verdict.ts) (the app UI is dark).
  Google provides both an on-white and an on-non-white variant; we use the
  non-white one. Add `powered-by-google-on-white.png` too if a light surface ever
  needs it.

Get the official, unmodified logo from Google's attribution assets (do not
recreate or restyle it):

- Google Maps Platform → Policies → **Attribution requirements**, "Powered by
  Google" logo download, or the attribution asset bundle linked from the Places
  API documentation.

Use the logo as provided. Do not alter its colors, proportions, or spacing.
A dark-background variant (`powered-by-google-on-non-white.png`) can be added
later if the verdict screen ever gets a dark theme.
