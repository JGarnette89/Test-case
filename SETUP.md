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

## 6. Put it on the internet

When you want to show someone:

> Deploy this to Vercel and give me the link.

Free, takes a couple of minutes, gives you a URL that works on any phone. That
is enough to hand to an instructor and watch them use it — which is the only
test that actually matters.

Native app stores come later, via Capacitor. The storage adapter is already
written for it.

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
