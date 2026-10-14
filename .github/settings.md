# GitHub Repository Settings — FurniConfig

# This file documents the recommended GitHub repository settings.
# Apply via GitHub UI or `gh repo edit`.

## General Settings

- **Repository name**: furniconfig
- **Description**: Plataforma SaaS B2B para diseño paramétrico de muebles a medida. Primer producto: clósets rectos modulares.
- **Website**: https://furniconfig.example.com (placeholder)
- **Topics**: typescript, react, threejs, parametric-design, cad, furniture, saas, b2b, geometry, 3d
- **Visibility**: Public
- **Template repository**: No

## Features

- [x] Issues
- [x] Projects (GitHub Projects)
- [x] Wiki (deshabilitado - usamos docs/)
- [x] Discussions (habilitado)
- [x] Sponsorships (si aplica)
- [ ] Packages (no publica a npm aún)

## Branches

- **Default branch**: `main`
- **Branch protection for `main`**:
  - [x] Require pull request reviews before merging (1 approval)
  - [x] Dismiss stale reviews when new commits are pushed
  - [x] Require status checks to pass before merging
    - [x] `verify` (CI job)
  - [x] Require branches to be up to date before merging
  - [x] Require conversation resolution before merging
  - [x] Require signed commits (opcional)
  - [x] Require linear history (merge commits OK, no squash/rebase)
  - [ ] Restrict who can push (solo mantenedores)
  - [ ] Allow force pushes (NO)
  - [ ] Allow deletions (NO)

## Security & Analysis

- [x] Dependency graph
- [x] Dependabot alerts
- [x] Dependabot security updates
- [x] Secret scanning
- [x] Secret scanning push protection
- [ ] Code scanning (CodeQL) — pendiente configurar

## Notifications

- **Watch**: All activity (mantenedores)
- **Email notifications**: Enabled for mantenedores

## Autolinks

- **JIRA/Linear**: No aplica (usamos GitHub Issues)
- **Custom autolinks**: No

## GitHub Pages

- **Source**: Deploy from branch (opcional - docs)
- **Branch**: `gh-pages` (si se habilita)
- **Custom domain**: No

## Webhooks

- Ninguno configurado (por ahora)

## Deploy keys

- Ninguna (por ahora)

## Environments

- No environments configurados (sin despliegue automático)

## Codespaces

- [ ] Habilitado (opcional para colaboradores)

## Merge settings

- [x] Allow merge commits (preserva historial)
- [ ] Allow squash merging (NO - pierde historial)
- [ ] Allow rebase merging (NO - pierde historial)
- [x] Auto-delete head branches after merge
- [x] Allow auto-merge (cuando CI pasa)

## Archives

- [ ] Repository archived (NO)

---

## Configuración via CLI (gh)

```bash
# Protección de rama main
gh api repos/jesusrv1103/furniconfig/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["verify"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --field required_linear_history=false \
  --field allow_auto_merge=true \
  --field required_conversation_resolution=true

# Configuración general
gh repo edit jesusrv1103/furniconfig \
  --description "Plataforma SaaS B2B para diseño paramétrico de muebles a medida. Primer producto: clósets rectos modulares." \
  --homepage "https://furniconfig.example.com" \
  --enable-issues \
  --enable-projects \
  --enable-wiki=false \
  --enable-discussions \
  --enable-merge-commit \
  --disable-squash-merging \
  --disable-rebase-merging \
  --enable-auto-merge \
  --delete-branch-on-merge \
  --add-topic typescript --add-topic react --add-topic threejs \
  --add-topic parametric-design --add-topic cad --add-topic furniture \
  --add-topic saas --add-topic b2b --add-topic geometry --add-topic 3d

# Topics
gh repo edit jesusrv1103/furniconfig \
  --add-topic typescript --add-topic react --add-topic threejs \
  --add-topic parametric-design --add-topic cad --add-topic furniture \
  --add-topic saas --add-topic b2b --add-topic geometry --add-topic 3d
```

## Labels (aplicar via script)

```bash
# Ver .github/labels.yml para lista completa
# Script sugerido:
# gh label create "good first issue" --color 7057ff --description "Ideal for new contributors"
# ... (repetir para cada label en .github/labels.yml)
```

## Issues Templates

Ya configurados en `.github/ISSUE_TEMPLATE/`:
- `bug_report.md`
- `feature_request.md`

## Pull Request Template

Ya configurado en `.github/pull_request_template.md`.

## Security

- **Security policy**: `SECURITY.md` (configurado)
- **Security advisories**: Habilitado en Security tab
- **Private vulnerability reporting**: Habilitado