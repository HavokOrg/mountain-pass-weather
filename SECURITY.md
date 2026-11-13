# Security Policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems.

Report it privately through GitHub instead: go to this repository's **Security** tab and choose **Report a vulnerability**. Only the maintainers can see the report. No email address is published for this project on purpose.

You can expect an acknowledgement within a week.

## What's in scope

Pass Weather is a static site on GitHub Pages. It has no backend, no accounts and no user data. The most relevant issues would be:

- A way to inject script or HTML into the page (XSS), for example through data from WSDOT, NWS, Open-Meteo or avalanche.org
- A weakness in the Content Security Policy
- Anything that could expose the `WSDOT_ACCESS_CODE` repository secret, for example through a GitHub Actions workflow
- A compromised or vulnerable dependency or GitHub Action

## How secrets are handled

- The only secret is the WSDOT Traveler API access code. It lives in GitHub's encrypted repository secrets and is read only by the scheduled deploy workflow.
- The browser never sees it. The site serves pre-fetched, cleaned JSON instead.
- Secret scanning and push protection are enabled on the repository.
