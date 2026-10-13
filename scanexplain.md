# Content Scanning in DosGato

Scanners are separate services that look at our content and report problems back to DosGato. DosGato stores what they find, shows it to editors, and lets administrators decide which scanners run where. Each scanner is its own project, so we can add new kinds of checks over time without changing DosGato itself.

## What kinds of scans are possible

Scanners can check pages, data entries, and assets (PDFs, images). They can run on live sites and on sandboxes, so a site can be checked before it launches. When a sandbox is promoted, its scan results and editor responses carry over to the live site. Archives are never scanned.

The obvious scanners report problems that exist right now:

- **Accessibility** (WCAG checks). These run on the rendered page, so a problem can't always be traced to the exact section it's in. When it can't, it's attached to a larger section around it.
- **Broken links**
- **Content quality** checked by an AI model: meaningless alt text, plain language, brand style, inclusive language
- **Sensitive data**, like student IDs or SSNs that shouldn't be on a public page

### Staleness scans

The one that shaped most of the design is a staleness scanner. After someone edits a page, an AI model reads it, picks out content that will probably go out of date, and suggests an expiration date for each piece it flags. For example:

- Step-by-step instructions for third-party software that will eventually change its screens
- Explicit dates on the page ("Register by March 1")
- Figures that change every year, like tuition and fees

The scanner can also add findings of its own alongside the AI's, like a whole-page "due for its yearly review" finding on every page, so mandatory reviews come along for free.

Until that date passes, nobody sees anything. Once it passes, the page gets an alert icon and shows up on the dashboard, and the flagged section gets a warning icon in the editor.

The hard part was keeping those dates stable. If someone edits an unrelated paragraph on the page every day, a naive scanner would keep re-reading the page and pushing the expiration date out forever. We avoid that by tracking each flagged section by its content rather than its position on the page. Moving sections around or editing other parts of the page doesn't affect a flag, so the original date holds. Only editing the flagged section itself starts things over.

## How editors interact with findings

Each problem a scanner reports is a **finding**. It points at a specific section of the page (or the page as a whole) and has a short message and a severity.

- **Pages, data entries, and assets with open findings get a badge**, and each site on the dashboard gets a badge too. Asset findings always apply to the whole file and are listed on the asset's detail page.
- **In the page editor, flagged sections get a warning icon** on their edit bar, with a tooltip summarizing the findings. A new "View Findings" action opens a panel with the full list and the response buttons.
- If the content was edited after the scan, the finding still shows up, marked "content changed since scan", until the next scan confirms whether the problem is gone.
- Scanners can provide a link to a full report in their own tool.

Editors have three ways to deal with a finding:

- **Fix it.** Editing the section makes the finding go away on the next scan. No button needed.
- **Mark it verified.** "I checked this, it's still accurate, check again in six months." Each scanner suggests how long a verification should last, and the editor can change it. When that date arrives the finding comes back, and the next verification defaults to whatever length the editor picked last time. If the AI guessed 30 days for a tuition table that changes once a year, the editor only has to correct it once.
- **Dismiss it**, which hides it for good. That's for false positives, and for things a scanner can't judge on its own, like whether text over a background image has enough contrast.

Each scanner decides which of those buttons it offers. Staleness findings offer both, since the AI will sometimes flag content that isn't really going to go stale. The link checker probably offers neither. A link to a site that blocks automated checkers might appear on two hundred pages, so dismissing it one page at a time would be pointless. Instead the editor gets a "Manage this link in Link Checker" link, and the link checker keeps its own list of false-positives.

Responses stick even if the section is moved around the page. If the section itself is edited, the old response goes away, since the editor's judgment was about content that no longer exists. Responding requires edit permission on the page.

## How administrators configure scanners

A scanner can't post anything until it has been registered, either by an administrator on a new Scanners admin page or automatically by a software release that ships one. This keeps an unapproved service from putting alerts in front of editors. Registering, changing, and removing scanners needs a new "manage scanners" permission, which superusers get by default.

For each scanner, an administrator sets:

- **Its name.**
- **Opt-out or opt-in.** Most scanners run everywhere unless a site is exempted, which is right for compliance checks like accessibility. Expensive scanners, like anything that pays for an AI model, can be opt-in, so they only run on sites that have been turned on.
- **How long to keep its history.** By default we keep the full detail of each page's last 5 scans, and summary numbers for 2 years.
- **Hidden or deleted.** Hiding a scanner takes it out of the interface but keeps its history. Deleting it removes everything it ever reported.

Each site's detail page gets a Scanning panel. From there an administrator can exempt the site from all scanning, exempt it from one scanner, or turn on an opt-in scanner. Good reasons to exempt: a site full of old archived PDFs, content synced from an outside system that editors can't fix, or a test site cluttering the dashboard. Site managers can see this panel but can't change it, because accessibility scanning is a compliance tool and a site shouldn't be able to waive it for itself.

Exempting a site hides its existing findings but doesn't delete them, so undoing an accidental click brings them back.

## What reports are possible

- **Site badges on the dashboard.** The dashboard stays focused on sites, so each site card gets a findings badge counting its open findings.
- **Pages with findings, on each site's dashboard page.** Clicking a site card opens its dashboard page, which gets a new panel listing that site's pages with open findings. How it's ordered and paged is still to be decided.

Both account for editor responses and for staleness dates that haven't arrived yet, so they only show what needs attention today.
- **Detailed reports** stay in each scanner's own tool, reached through the link on each scan.

## What's out of scope

### Future enhancements

- **Trend charts.** Each scanner's summary numbers are kept for 2 years, so charts could be added later, but none are planned.
- **Subtree counts in the page, asset, and data trees.** Showing that a collapsed page or folder has open findings somewhere beneath it, even when it has none of its own. We don't have a design for it yet.
- **A "rescan now" button** for editors. Scanners decide their own schedules for now. We may add a way to request a rescan later, for scanners that support it.

### Likely never

- **Sandbox, page, or folder controls in the Scanning panel.** Exemptions there are per site. Whether a scanner runs on sandboxes is left to the scanner: the staleness scanner will simply never scan them, while others might scan the live site regularly and sandboxes on request, once we can trigger scans. For a single page, editors can dismiss or verify findings, or a page template can offer a setting like "Don't review this page for staleness" that the scanner checks. Editors control that setting, so it only suits scanners where they should have the choice, never accessibility.
- **Dismissing something everywhere at once** from within DosGato. That belongs in the scanner's own tool, like the link checker's list of known-good links.
- **Scanning archives.**
- **Problems that span pages**, like two pages giving different deadlines for the same event. Every finding belongs to one page.
