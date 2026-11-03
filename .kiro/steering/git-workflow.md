---
inclusion: always
---

# Git workflow

- The owner wants every finished change on `main` right away. Commit and push directly to `main` (`git push origin main`). Don't create feature branches or pull requests unless the owner asks for them.
- Before pushing, run `git pull` on `main` so the push doesn't overwrite newer commits.
- Before committing, run `node --check` on every changed `.js` file.
- Write commit messages as one short line saying what changed, e.g. "Orders: show sold cups and complimentary cups separately".
- Never force-push to `main`.
