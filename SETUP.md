# Getting off the chat window

You need a laptop or desktop for this. Mac, Windows, or Linux all work — the
tablet you mark on cannot do it.

Budget an hour for the first time. Most of that is downloads.

---

## 1. Install Node.js

Node is the engine that builds React apps. Claude Code does not need it, but
your project does.

Go to **https://nodejs.org** and download the **LTS** version. Run the installer,
accept the defaults.

Check it worked — open Terminal (Mac: Cmd+Space, type "Terminal") or PowerShell
(Windows: Start, type "PowerShell") and run:

```
node --version
```

You want v20 or higher. If you get "command not found", the installer did not
finish or you need to close and reopen the terminal.

---

## 2. Install Claude Code

Two options. **If you have never used a terminal, take the Desktop app.**

**Desktop app (no terminal):** download from
https://claude.com/product/claude-code — available for macOS, Windows, and Linux.

**Terminal:**

- macOS / Linux: `curl -fsSL https://claude.ai/install.sh | bash`
- Windows PowerShell: `irm https://claude.ai/install.ps1 | iex`

Either way you will be asked to log in. Claude Code needs a Pro, Max, Team,
Enterprise, or Console account — it is not on the free plan.

---

## 3. Make a project folder

Create a folder somewhere sensible — `Documents/drivedraw` is fine.

Put these files in it:

```
drivedraw/
  CLAUDE.md
  DriveDraw.jsx
  RightOfWay.jsx
  RightOfWayTiming.jsx
```

`CLAUDE.md` is the important one. Claude Code reads it at the start of every
session, so it already knows the Ontario rules, the architecture decisions, and
the verification requirement without you re-explaining.

---

## 4. First session

Open Claude Code and point it at the folder. In the terminal that is:

```
cd Documents/drivedraw
claude
```

In the Desktop app, open the folder from the UI.

Then type this — plain English, no commands:

> Read CLAUDE.md. Set this up as a Vite + React project so I can run all three
> files in a browser. Add a simple menu to switch between DriveDraw, Right of
> Way, and the timing version. Explain what you are going to do before you do it.

It will lay out a plan. **Read it.** If something looks wrong, say so. Then let
it build.

When it finishes:

```
npm run dev
```

That prints a web address like `http://localhost:5173`. Open it in a browser.
That is your app, running on your own machine, reloading every time a file
changes.

---

## 5. Version control, immediately

Git is your undo button. Without it, a bad change means starting over; with it,
it means one command. It is also what makes experimenting safe.

Tell Claude Code:

> Set up git for this project, make an initial commit, and write a .gitignore.
> Then explain how I commit changes myself.

Then make a free account at **https://github.com**, create an empty repository,
and ask Claude Code to push to it. Now your work is backed up off your laptop.

**Habit: commit whenever something works.** Not when it is finished — when it
works. Those are your save points.

---

## 6. Put it on the internet — and on your phone

**Tonight, on the same Wi-Fi.** The dev server already listens on the
network, so a phone on the same Wi-Fi can open it. Run `npm run dev` and
it prints two addresses — `Local:` and `Network:`. Type the `Network:`
one (something like `http://192.168.1.23:5173/#/iso`) into the phone's
browser. The build works the same way, and is what a player would get:

    npm run build
    npm run preview -- --host

then open the `Network:` address it prints. If the phone cannot reach
it, the Windows firewall is asking; allow Node on private networks.

Two things about that address. **It lives only as long as the server
does** -- a dev server started inside a Claude session dies with the
session, and a phone tab left open keeps running the code it already
loaded, so reload the page and check the build stamp on the screen
before trusting a run. And **it is plain HTTP, not a secure context**,
so browser APIs that need one are simply absent there: the clipboard
API, client hints, and more (CLAUDE.md, Conventions). The app has to
work without them, and where it cannot it has to say so. The deployed
site is HTTPS and has all of them.

**Permanently, for anyone with the link.** The repository carries a
GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds and
publishes the site to GitHub Pages on every push to `main`. What it
needs from you, and it can be done from a phone:

**Done, 24 September.** The repository is
https://github.com/JGarnette89/Test-case (public -- GitHub Pages on a
free plan needs it) and Pages is set to deploy from GitHub Actions. The
site is https://jgarnette89.github.io/Test-case/ and rebuilds on every
push to `main`.

For the record, and for the next repository: the setting lives at
`https://github.com/<owner>/<repo>/settings/pages` -- open that link in
a phone's BROWSER, signed in, and set "Build and deployment" -> Source
to "GitHub Actions". The GitHub mobile app has no repository settings
at all, and a phone browser hides the Settings tab in the tab bar's
overflow, which is why "Settings -> Pages" could not be found by
following the words.

The first push has to come from this PC, and the one thing a session
cannot do is sign you in: the next time you are at the PC, run
`git push -u origin main` in a terminal in the project folder and
finish the sign-in window that opens. After that once, every push is
Claude's, the site rebuilds itself on each one, and it lives at
`https://<your-username>.github.io/drivedraw/` about two minutes
later -- HTTPS, so everything the LAN address lacks works there.

The site is served from a sub-path named after the repository, which the
build handles through `BASE_PATH`; the hash routes (`#/iso`) work
unchanged. Vercel or Netlify would also do it in a couple of minutes if
GitHub Pages is ever in the way.

Native app stores come later, via Capacitor. The storage adapter is
already written for it.

---

## Where people actually get stuck

**"command not found" after installing something.** Close the terminal
completely and open a new one. Installers change your PATH and existing terminal
windows do not pick it up.

**Permission errors on npm.** Do not use `sudo`. Paste the error into Claude
Code and let it fix the cause.

**It works locally but breaks when deployed.** Almost always a file-name case
mismatch — Macs do not care about capitalisation and deployment servers do.

**A change makes everything worse.** `git restore .` throws away everything
since your last commit. This is why you commit often.

---

## The first three real tasks

Once it runs, in this order:

1. **Add a localStorage adapter** so saved scenarios survive a refresh. Small,
   self-contained, and you will see it work immediately — a good first change.
2. **Write scenarios 11 through 30** for Right of Way. This is the actual
   product work and only you can do it. Claude Code can wire them up; the
   judgment about what fails candidates is yours.
3. **Get it on a phone in someone else's hands.** Not more features. Someone
   else's hands.
