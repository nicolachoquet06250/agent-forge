# Agent Forge

Éditeur local Astro/Tauri pour créer des profils d'agents IA en `.agent.md` et des Agent Skills en `SKILL.md`.

## Fonctionnalités

- page `/agents` dédiée aux profils d'agents ;
- page `/skills` dédiée aux skills ;
- génération guidée du frontmatter YAML et du corps Markdown ;
- validation en direct des contraintes bloquantes et recommandations ;
- aperçu Markdown en direct et vue source ;
- persistance automatique dans `localStorage` ;
- association d'un agent à un ou plusieurs skills ;
- liens internes vers les skills dans l'aperçu d'un agent ;
- ressources de skill sous `scripts/`, `references/` et `assets/` ;
- import de fichiers texte ou binaires dans un skill ;
- export d'un Markdown seul ou d'un bundle ZIP ;
- export d'un agent avec tous ses skills référencés et leurs ressources ;
- application desktop Tauri v2 embarquant intégralement le build Astro `dist/`.

## Arborescence des bundles agents/skills

```text
agents/
└── mon-agent.agent.md
skills/
└── mon-skill/
    ├── SKILL.md
    ├── scripts/
    │   └── script.py
    ├── references/
    │   └── REFERENCE.md
    └── assets/
        └── template.json
```

## Routage dans Tauri

Astro est explicitement compilé en sortie statique avec `build.format: 'directory'` :

```text
/               -> dist/index.html
/agents         -> dist/agents/index.html
/skills         -> dist/skills/index.html
```

Tauri embarque récursivement `dist/` via `build.frontendDist: "../dist"`. Son protocole d'assets résout automatiquement une route sans extension vers le fichier `.html` ou le `index.html` correspondant.

Les query strings ne sont pas utilisées pour choisir l'asset, mais restent sur l'URL de la WebView. Par exemple :

```text
/agents?agent=abc123
```

sert `dist/agents/index.html` tout en conservant `?agent=abc123`, donc `new URLSearchParams(location.search)` continue de fonctionner sans adaptation. Même principe pour `/skills?skill=...` et pour toute future route Astro statique.

## Conventions implémentées

### Agents

L'éditeur suit le format `.agent.md` de VS Code / GitHub Copilot : frontmatter YAML, `description`, nom, modèle, outils, cible, visibilité/invocation, skills associés et handoffs. Le corps est structuré autour de la mission, des responsabilités, du workflow, des garde-fous et du contrat de sortie.

Références :

- https://code.visualstudio.com/docs/agent-customization/custom-agents
- https://docs.github.com/en/copilot/reference/custom-agents-configuration

### Skills

L'éditeur suit la spécification Agent Skills :

- `name` obligatoire, 1–64 caractères, kebab-case strict et identique au nom du dossier ;
- `description` obligatoire, 1–1024 caractères, avec le rôle et le contexte d'activation ;
- `compatibility` limitée à 500 caractères ;
- métadonnées chaîne → chaîne ;
- `allowed-tools` traité comme expérimental ;
- ressources relatives sous `scripts/`, `references/` et `assets/` ;
- avertissements lorsque le `SKILL.md` devient trop long pour une bonne divulgation progressive.

Référence : https://agentskills.io/specification

## Développement web

```sh
npm install
npm run dev
```

Build Astro seul :

```sh
npm run build
```

Le résultat est écrit dans `dist/`.

## Développement desktop Tauri

Prérequis Tauri desktop : Node.js, Rust stable et les dépendances système propres à l'OS.

```sh
npm install
npm run tauri:dev
```

Tauri lance le serveur Astro sur `http://127.0.0.1:4321` via `beforeDevCommand`.

## Build de production desktop

```sh
npm install
npm run tauri:build
```

La commande exécute automatiquement `npm run build`, puis Tauri embarque `dist/` dans l'application native et génère les bundles de la plateforme courante sous :

```text
src-tauri/target/release/bundle/
```

Le build desktop n'a pas besoin d'un serveur HTTP en production.

Aucune donnée n'est envoyée à un serveur par l'application. L'état du workspace reste dans le navigateur/WebView.

## Tests et couverture

Les tests unitaires utilisent **Vitest** avec le provider de couverture **V8** (`@vitest/coverage-v8`). Les rapports sont générés dans `coverage/` aux formats texte, HTML, JSON, LCOV et Cobertura.

```bash
npm install --include=dev
npm test
npm run test:coverage
```

Les seuils initiaux sont définis dans `vitest.config.ts` : 70 % pour statements/functions/lines et 65 % pour branches. Ils peuvent être relevés progressivement sans modifier les tests.

## CI/CD et releases

Deux pipelines sont fournis :

- `.github/workflows/ci-release.yml` pour GitHub Actions ;
- `.gitlab-ci.yml` pour GitLab CI.

Sur une branche ou une merge/pull request, ils exécutent les tests + coverage, construisent le site Astro et génèrent les bundles Tauri Linux/Windows comme artefacts CI.

Une release est publiée uniquement lorsqu'un tag `v*` est poussé, par exemple :

```bash
git tag v0.0.1
git push origin v0.0.1
```

Avant de créer le tag, gardez la version du tag alignée avec `package.json`, `src-tauri/tauri.conf.json` et `src-tauri/Cargo.toml`.

Les assets de release produits sont :

- Linux : `.AppImage` et `.deb` ;
- Windows : installateur NSIS `.exe`.

### GitLab Windows runner

Le job `build_tauri_windows` cible un runner GitLab portant le tag `windows`. Ce runner doit disposer de **Node.js 22** et des **Microsoft C++ Build Tools / MSVC** nécessaires à Tauri. Le pipeline installe Rust automatiquement s'il n'est pas déjà présent.

Sur GitLab, la release est créée avec `glab` en utilisant le `CI_JOB_TOKEN`, et les artefacts Tauri sont publiés dans le Generic Package Registry puis joints à la release.
