# Rebel Ants Trait Builder — v23u (STABLE)

Pure static app (no build step).

## Run locally
python3 -m http.server 8080
# then open http://localhost:8080/index.html

## Deploy on Vercel
Import this repo → Framework: Other → leave Build Command empty → deploy.

Small tweaks (fastest)
	1.	Edit files on main in GitHub Desktop → Commit → Push.
	2.	Vercel auto‑deploys Production (your public link updates).

Safer changes (preview first)
	1.	GitHub Desktop → Repository → New Branch… → name feature/<short-name>.
	2.	Make edits → Commit → Push origin.
	3.	Vercel → Project → Deployments → open the Preview URL for that branch and test (desktop + phone).
	4.	When happy → merge the feature branch into main (Desktop or GitHub).
Vercel auto‑deploys Production.

Rollback
	•	GitHub: open the merged PR → Revert → merge the rollback PR.
	•	Vercel: Deployments → hover an older Production → Promote to Production.
