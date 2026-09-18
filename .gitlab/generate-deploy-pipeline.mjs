import { readFile, writeFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const version = pkg.version;

if (!version) {
  throw new Error('package.json does not contain a version.');
}

const expectedTag = `v${version}`;

const apiUrl = process.env.CI_API_V4_URL;
const projectId = process.env.CI_PROJECT_ID;
const jobToken = process.env.CI_JOB_TOKEN;

if (!apiUrl || !projectId || !jobToken) {
  throw new Error(
    'Missing one of the required GitLab CI variables: CI_API_V4_URL, CI_PROJECT_ID, CI_JOB_TOKEN.',
  );
}

const endpoint =
  `${apiUrl}/projects/${encodeURIComponent(projectId)}/releases/permalink/latest`;

const response = await fetch(endpoint, {
  headers: {
    'JOB-TOKEN': jobToken,
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

console.log(`Latest release tag: ${latestTag || '(none)'}`);
console.log(`package.json release tag: ${expectedTag}`);

const shouldDeploy = latestTag !== expectedTag;

const generatedPipeline = shouldDeploy
  ? String.raw`include:
  - local: '/.gitlab/deploy-child.yml'
`
  : String.raw`stages:
  - done

version_already_released:
  stage: done
  image: alpine:3.20
  script:
    - echo "${expectedTag} is already the latest release; deployment stopped after tests."
`;

console.log(
  shouldDeploy
    ? 'Version differs: deployment child pipeline will be started.'
    : 'Version is already released: deployment stops after tests.',
);

await writeFile('deploy-child.yml', generatedPipeline, 'utf8');
