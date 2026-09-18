import { readFile, writeFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const version = pkg.version;

if (!version) {
  throw new Error('package.json does not contain a version.');
}

const expectedTag = `v${version}`;
const endpoint = `${process.env.CI_API_V4_URL}/projects/${process.env.CI_PROJECT_ID}/releases/permalink/latest`;
const response = await fetch(endpoint, {
  headers: {
    'JOB-TOKEN': process.env.CI_JOB_TOKEN,
  },
});

let latestTag = '';

if (response.status === 404) {
  console.log('No published GitLab release exists yet.');
} else if (!response.ok) {
  throw new Error(
    `Unable to read latest GitLab release: HTTP ${response.status} ${await response.text()}`,
  );
} else {
  const release = await response.json();
  latestTag = release.tag_name ?? '';
}

const shouldDeploy = latestTag !== expectedTag;

console.log(`Latest release tag: ${latestTag || '(none)'}`);
console.log(`package.json release tag: ${expectedTag}`);
console.log(
  shouldDeploy
    ? 'Version differs: generating build/release child pipeline.'
    : 'Version is already released: no build or deployment jobs will be generated.',
);

const skippedPipeline = String.raw`stages:
  - done

version_already_released:
  stage: done
  image: alpine:3.20
  script:
    - echo "${expectedTag} is already the latest release; deployment stopped after tests."
`;

const deployPipeline = String.raw`stages:
  - build
  - package
  - release

variables:
  NPM_CONFIG_CACHE: "$CI_PROJECT_DIR/.npm"
  APP_VERSION: "${version}"
  RELEASE_TAG: "${expectedTag}"

.node-cache:
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - .npm/
    policy: pull-push

build_astro:
  stage: build
  image: node:22-bookworm
  extends: .node-cache
  script:
    - npm install --include=dev
    - npm run build
  artifacts:
    expire_in: 7 days
    paths:
      - dist/

build_tauri_linux:
  stage: package
  image: node:22-bookworm
  extends: .node-cache
  before_script:
    - apt-get update
    - >-
      apt-get install -y
      libwebkit2gtk-4.1-dev
      build-essential
      curl
      wget
      file
      libxdo-dev
      libssl-dev
      libayatana-appindicator3-dev
      librsvg2-dev
      patchelf
    - curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
    - export PATH="$HOME/.cargo/bin:$PATH"
    - rustc --version
    - cargo --version
  script:
    - export PATH="$HOME/.cargo/bin:$PATH"
    - npm install --include=dev
    - npm run tauri:build -- --bundles deb,appimage
    - mkdir -p release-linux
    - find src-tauri/target/release/bundle -type f -name '*.AppImage' -exec cp {} release-linux/ \;
    - find src-tauri/target/release/bundle -type f -name '*.deb' -exec cp {} release-linux/ \;
    - test -n "$(find release-linux -maxdepth 1 -type f -print -quit)"
  artifacts:
    expire_in: 7 days
    paths:
      - release-linux/

build_tauri_windows:
  stage: package
  tags:
    - windows
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - .npm/
    policy: pull-push
  before_script:
    - |
      $ErrorActionPreference = "Stop"
      if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) {
        Invoke-WebRequest https://win.rustup.rs/x86_64 -OutFile rustup-init.exe
        .\\rustup-init.exe -y --profile minimal --default-toolchain stable
        $env:PATH = "$env:USERPROFILE\\.cargo\\bin;$env:PATH"
      } else {
        rustup default stable
      }
      rustc --version
      cargo --version
      node --version
      npm --version
  script:
    - npm install --include=dev
    - npm run tauri:build -- --bundles nsis
    - New-Item -ItemType Directory -Force release-windows | Out-Null
    - Get-ChildItem -Path src-tauri\\target\\release\\bundle\\nsis -Filter *.exe | Copy-Item -Destination release-windows
    - if ((Get-ChildItem release-windows -File).Count -eq 0) { throw "No Windows release artifact was produced." }
  artifacts:
    expire_in: 7 days
    paths:
      - release-windows/

create_release:
  stage: release
  image: registry.gitlab.com/gitlab-org/cli:latest
  needs:
    - job: build_astro
      artifacts: false
    - job: build_tauri_linux
      artifacts: true
    - job: build_tauri_windows
      artifacts: true
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  variables:
    GLAB_ENABLE_CI_AUTOLOGIN: "true"
  script:
    - ls -lah release-linux release-windows
    - >-
      glab release create "$RELEASE_TAG"
      release-linux/*
      release-windows/*
      --name "Agent Forge $RELEASE_TAG"
      --notes "Automated Agent Forge $APP_VERSION release. Linux and Windows binaries are attached to this release."
      --ref "$CI_COMMIT_SHA"
      --use-package-registry
`;

await writeFile(
  'deploy-child.yml',
  shouldDeploy ? deployPipeline : skippedPipeline,
  'utf8',
);
