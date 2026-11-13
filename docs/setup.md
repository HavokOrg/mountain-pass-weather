# One-time setup

The checklist for getting from a local folder to a live, locked-down site. Steps marked **You** need your own login. Claude can't and shouldn't do those. Steps marked **Claude** are run with the GitHub CLI once you're logged in.

## 1. Account privacy (You)

GitHub, then **Settings**, then **Emails**:

- [ ] **Keep my email addresses private**: on
- [ ] **Block command line pushes that expose my email**: on

## 2. Create the organization (You, website only)

- [ ] Open https://github.com/account/organizations/new?plan=free
- [ ] Organization name: `pass-weather`. Plan: Free. It belongs to your personal account.
- [ ] Leave the organization's *public* profile email blank. The contact email on the creation form is for GitHub notifications.
- [ ] Organization membership is private by default. Keep it that way (org, then **People**).

## 3. GitHub CLI (You, in a terminal)

```bash
winget install --id GitHub.cli -e
```

Then open a new terminal and log in. Choose GitHub.com, HTTPS, and log in with a web browser:

```bash
gh auth login
```

You type the one-time code into your browser yourself. Claude never sees your password or token.

## 4. Create and configure the repo (Claude)

- [ ] Set the repo-local commit author name to "Pass Weather contributors"
- [ ] Create the public repo `pass-weather/mountain-pass-weather` and push `main`
- [ ] **Pages:** source = GitHub Actions
- [ ] **Actions:** default workflow token permission = read-only. Actions may not create or approve pull requests.
- [ ] **Org Actions policy:** allow only actions created by GitHub (we use only `actions/*`)
- [ ] **Security:** Dependabot alerts and security updates, secret scanning, push protection, private vulnerability reporting
- [ ] **Ruleset on `main`:** require a pull request, require the `CI / check` status to pass, block force-pushes and deletion

## 5. WSDOT access code (You, before Phase 2)

- [ ] Get a free code by entering an email at https://wsdot.wa.gov/traffic/api/
- [ ] **Don't paste it into a chat, an issue or a file.** Store it as an encrypted repo secret. This command prompts for it privately:

```bash
gh secret set WSDOT_ACCESS_CODE --repo pass-weather/mountain-pass-weather
```

- [ ] Optional, for running the fetch script locally: put it in a git-ignored `.env.local` (see `.env.example`)
