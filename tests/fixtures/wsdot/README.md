# WSDOT sample data

Synthetic samples in the WSDOT Traveler Information API REST format. IDs, titles and image URLs come from WSDOT public RSS feeds; values and coordinates are illustrative. Each file deliberately includes malformed or out-of-scope records to exercise the parsers.

The reference "now" for these fixtures is 2026-11-13T07:00:00Z (11:00 PM Pacific on Nov 12). `npm run sample:wsdot` shifts every date so that moment becomes the current time.
