# EV Geek Studios — Charging Curves

The charging-curve chart on <https://evgeekstudios.com/curves>.

| File | What it is |
|---|---|
| `evc.js` | **The whole widget** — styles, markup and logic. The only file you'll ever edit. |
| `index.html` | A live preview page. GitHub Pages serves it so you can check a change before it hits the real site. |
| `embed.html` | The two lines that go in Squarespace. Paste once, then forget it exists. |

There is no build step and no dependencies. Data comes from the Google Sheet at
runtime; nothing else is fetched.

---

## One-time setup

### 1. Put these files in a GitHub repo

On <https://github.com> → **New repository**.

- Name it something like `ev-charging-curves`
- **Visibility must be Public** — GitHub Pages doesn't serve private repos on a free account
- Create it, then **Add file → Upload files**, drag in `evc.js`, `index.html`,
  `embed.html` and this `README.md`, and **Commit changes**

### 2. Turn on GitHub Pages

In the repo: **Settings → Pages**.

- **Source:** Deploy from a branch
- **Branch:** `main`, folder `/ (root)` → **Save**

Wait about a minute, then open:

```
https://YOUR-USERNAME.github.io/ev-charging-curves/
```

You should see the chart. If you get a 404, Pages is still building — give it
another minute and reload.

### 3. Point Squarespace at it

Edit the `/curves` page.

1. **Delete the Tableau block and the Google Sheet block.** They're both replaced.
2. Add a **Code** block.
3. Paste the contents of `embed.html`, changing `YOUR-USERNAME` and `REPO` to match
   your Pages URL from step 2.
4. Save.

> **The Squarespace editor will show a grey placeholder, not the chart.** It never
> runs scripts in edit mode. View the live page to see it working. This is normal
> and is not a sign anything is broken.

That's the last time you need to open Squarespace for this.

---

## Updating the data

**Nothing to deploy.** Add rows to the **Aggregated Data (Looker)** tab of the
Google Sheet and they appear on the next page load.

```
Vehicle | State of Charge | Charge Power (kW) | Time Elapsed | Session Notes
```

- State of charge accepts `45` or `45%`
- Time elapsed accepts `16m47s` or `0:16:47`, counted from the start of the session
- A blank power cell means "no reading here" — the row is skipped, not plotted as zero
- Colours are assigned in sheet order and stay with a vehicle. Past eight vehicles
  the colours repeat with a dashed line, so two cars are never told apart by colour alone

For the **range added** figures, also add the vehicle to the **At-a-glance** tab
with its EPA Range. Names are matched after dropping `RWD`, `Long Range`, `Base`
and `Battery`, so they don't have to be byte-identical — but they do have to be
close. A vehicle with no At-a-glance row simply shows `—` instead of miles.

---

## Updating the code

1. Open `evc.js` on github.com and click the pencil (or edit it locally and push)
2. Make the change
3. **Bump `VERSION`** near the top
4. Commit

GitHub Pages rebuilds in ~1 minute. Browsers cache the file for up to 10 minutes,
so allow a little longer for the live site, or hard-refresh (`Ctrl`+`F5`).

**To check which version is live:** view source on the page and look at the mount
point — it stamps itself:

```html
<div id="evc-mount" data-evc-ready="1.1.0">
```

If that number doesn't match what you committed, you're still seeing a cached copy.

---

## If something looks wrong

| Symptom | Cause |
|---|---|
| "Charging data is temporarily unavailable" | `evc.js` didn't load. Check the Pages URL in the Squarespace block and that the repo is still public. |
| "showing saved data from …" under the chart | Google Sheets was unreachable, so it fell back to the last good copy held in the browser. It recovers by itself. |
| "Couldn't load the charging data" | Sheets was unreachable *and* there's no cached copy. Confirm the sheet is still published to the web. |
| A curve doubles back on the time view | An elapsed time in the sheet goes backwards between two rows. Sort that vehicle by state of charge and look for a time that's earlier than the row above it. |
| A vehicle shows `—` for range added | It has no row in the At-a-glance tab, or its name there is too different to match. |

The sheet is published at:
`https://docs.google.com/spreadsheets/d/e/2PACX-1vQFUGS2wf9kJUK30Rj9S0QEyrRkSZAY46Y-vO14toJcFeJJrNckkJdD-ToJcq9Vry-FMluAl5xbBBJg/pubhtml`

If you ever re-publish the sheet and the key changes, update `SHEET` at the top
of `evc.js`.
