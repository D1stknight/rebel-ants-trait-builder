# Rebel Ants Trait Builder Ã¢ÂÂ v23u (STABLE)

Pure static app (no build step).

## Run locally
python3 -m http.server 8080
# then open http://localhost:8080/index.html

## Deploy on Vercel
Import this repo Ã¢ÂÂ Framework: Other Ã¢ÂÂ leave Build Command empty Ã¢ÂÂ deploy.

Small tweaks (fastest)
	1.	Edit files on main in GitHub Desktop Ã¢ÂÂ Commit Ã¢ÂÂ Push.
	2.	Vercel autoÃ¢ÂÂdeploys Production (your public link updates).

Safer changes (preview first)
	1.	GitHub Desktop Ã¢ÂÂ Repository Ã¢ÂÂ New BranchÃ¢ÂÂ¦ Ã¢ÂÂ name feature/<short-name>.
	2.	Make edits Ã¢ÂÂ Commit Ã¢ÂÂ Push origin.
	3.	Vercel Ã¢ÂÂ Project Ã¢ÂÂ Deployments Ã¢ÂÂ open the Preview URL for that branch and test (desktop + phone).
	4.	When happy Ã¢ÂÂ merge the feature branch into main (Desktop or GitHub).
Vercel autoÃ¢ÂÂdeploys Production.

Rollback
	Ã¢ÂÂ¢	GitHub: open the merged PR Ã¢ÂÂ Revert Ã¢ÂÂ merge the rollback PR.
	Ã¢ÂÂ¢	Vercel: Deployments Ã¢ÂÂ hover an older Production Ã¢ÂÂ Promote to Production.

Preview build test
