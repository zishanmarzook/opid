# ReturnReady

A mobile-ready purchase tracker that helps people remember return windows and warranty dates. Built as an installable, offline-capable web app using plain HTML, CSS, and JavaScript modules.

## Features

- Add and edit purchases, merchants, amounts, categories, order references, and notes.
- Set a return period in calendar days or choose an exact deadline.
- Track optional warranties with correct month-end and leap-year arithmetic.
- See upcoming dates, search and filter purchases, and mark items kept or returned.
- Undo deletions, reopen decisions, and review active or ended warranties.
- Export and validate imported JSON backups.
- Clear sample data when ready to start a personal collection.

Purchase information is saved in this browser on this device. There is no account sync, merchant integration, cloud receipt storage, or background notification service. Return and warranty dates are based on information entered by the user; store policies may differ. Currency changes affect default entry and summary display, without converting historical amounts.

## Run locally

Serve `dist/` with any static web server. For example:

```sh
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080`. Module scripts need HTTP rather than opening `index.html` directly. Installation and service-worker support depend on the browser and require HTTPS or localhost.

## Verify

```sh
npm run check
npm test
```

Node.js 24 or later is used for the checks and tests. No runtime dependencies or build step are required. Publish the contents of `dist/` to a static host. Monetary values are stored as integer cents and different currencies are never summed together.
