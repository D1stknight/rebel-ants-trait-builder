# Rebel Ants Trait Builder â v23u (STABLE)

Pure static app (no build step).

## Run locally
python3 -m http.server 8080
# then open http://localhost:8080/index.html

## Deploy on Vercel
Import this repo â Framework: Other â leave Build Command empty â deploy.

Small tweaks (fastest)
	1.	Edit files on main in GitHub Desktop â Commit â Push.
	2.	Vercel autoâdeploys Production (your public link updates).

Safer changes (preview first)
	1.	GitHub Desktop â Repository â New Branchâ¦ â name feature/<short-name>.
	2.	Make edits â Commit â Push origin.
	3.	Vercel â Project â Deployments â open the Preview URL for that branch and test (desktop + phone).
	4.	When happy â merge the feature branch into main (Desktop or GitHub).
Vercel autoâdeploys Production.

Rollback
	â¢	GitHub: open the merged PR â Revert â merge the rollback PR.
	â¢	Vercel: Deployments â hover an older Production â Promote to Production.

Preview build test
<!-- claude phase-1 test commit 2026-05-10T02:38:11.414Z -->
