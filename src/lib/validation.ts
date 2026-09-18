import type { AgentDefinition, ProjectState, SkillDefinition, ValidationIssue } from './types';
import { buildAgentMarkdown, buildSkillMarkdown } from './markdown';

const AGENT_FILE_RE = /^[A-Za-z0-9._-]+$/;
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESOURCE_PATH_RE = /^(scripts|references|assets)\/[A-Za-z0-9._@+()\-/ ]+$/;

export function validateAgent(agent: AgentDefinition, project: ProjectState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (level: ValidationIssue['level'], code: string, message: string, field?: string) => issues.push({ level, code, message, field });

  if (!agent.fileName.trim()) add('error', 'agent.filename.required', 'Le nom de fichier est obligatoire.', 'fileName');
  else if (!AGENT_FILE_RE.test(agent.fileName)) add('error', 'agent.filename.charset', 'Le nom de fichier ne peut contenir que lettres, chiffres, point, tiret et underscore.', 'fileName');

  if (!agent.description.trim()) add('error', 'agent.description.required', 'La description du rôle de l’agent est obligatoire.', 'description');
  else if (agent.description.trim().length < 20) add('warning', 'agent.description.precision', 'Précisez davantage le rôle et le contexte d’utilisation de l’agent.', 'description');

  if (!agent.mission.trim()) add('error', 'agent.mission.required', 'Définissez une mission explicite : rôle, objectif et périmètre.', 'mission');
  if (!agent.workflow.trim()) add('error', 'agent.workflow.required', 'Définissez un workflow opérationnel vérifiable.', 'workflow');
  if (!agent.constraints.trim()) add('warning', 'agent.constraints.recommended', 'Ajoutez des contraintes / garde-fous pour réduire les comportements ambigus.', 'constraints');
  if (!agent.output.trim()) add('warning', 'agent.output.recommended', 'Définissez le format de sortie attendu et les critères de fin.', 'output');

  if (agent.tools.length === 0) add('warning', 'agent.tools.least-privilege', 'Aucun outil n’est restreint : l’agent héritera potentiellement de tous les outils disponibles. Appliquez le principe du moindre privilège.', 'tools');
  if (agent.target === 'github-copilot' && agent.argumentHint.trim()) add('warning', 'agent.argumentHint.target', '`argument-hint` est destiné aux agents IDE/VS Code et est ignoré par l’agent cloud GitHub.', 'argumentHint');
  if (agent.target === 'github-copilot' && agent.handoffs.length > 0) add('warning', 'agent.handoffs.target', 'Les handoffs sont pris en charge par VS Code mais ignorés par l’agent cloud GitHub.', 'handoffs');

  for (const handoff of agent.handoffs) {
    if (!handoff.label.trim() || !handoff.agent.trim()) add('error', 'agent.handoff.required', 'Chaque handoff doit avoir un libellé et un agent cible.', 'handoffs');
  }

  const generatedAgent = buildAgentMarkdown(agent, project);
  const bodyLength = generatedAgent.replace(/^---\n[\s\S]*?\n---\n?/, '').length;
  if (bodyLength > 30000) add('error', 'agent.body.max', `Le corps généré fait ${bodyLength.toLocaleString('fr-FR')} caractères, au-delà de la limite de 30 000.`, 'body');

  for (const skillId of agent.skillIds) {
    const skill = project.skills.find((item) => item.id === skillId);
    if (!skill) add('error', 'agent.skill.missing', 'Une référence de skill pointe vers un skill supprimé.', 'skills');
    else {
      const skillErrors = validateSkill(skill).filter((issue) => issue.level === 'error');
      if (skillErrors.length) add('error', 'agent.skill.invalid', `Le skill « ${skill.name || 'sans nom'} » référencé contient ${skillErrors.length} erreur(s) bloquante(s).`, 'skills');
    }
  }

  if (!issues.some((issue) => issue.level === 'error' || issue.level === 'warning')) {
    add('success', 'agent.valid', 'L’agent respecte les contraintes structurelles et les recommandations contrôlées par l’éditeur.');
  }
  return issues;
}

export function validateSkill(skill: SkillDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (level: ValidationIssue['level'], code: string, message: string, field?: string) => issues.push({ level, code, message, field });

  if (!skill.name.trim()) add('error', 'skill.name.required', 'Le nom du skill est obligatoire.', 'name');
  else {
    if (skill.name.length > 64) add('error', 'skill.name.max', 'Le nom du skill est limité à 64 caractères.', 'name');
    if (!SKILL_NAME_RE.test(skill.name)) add('error', 'skill.name.format', 'Utilisez uniquement a-z, 0-9 et des tirets simples (kebab-case), sans tiret initial/final ni double tiret.', 'name');
  }

  if (!skill.description.trim()) add('error', 'skill.description.required', 'La description du skill est obligatoire.', 'description');
  else {
    if (skill.description.length > 1024) add('error', 'skill.description.max', 'La description est limitée à 1 024 caractères.', 'description');
    if (skill.description.length < 35) add('warning', 'skill.description.precision', 'Décrivez précisément ce que fait le skill et quand il doit être utilisé.', 'description');
    if (!/(use when|when |utilis|lorsque|quand|pour les? tâches|si l’utilisateur)/i.test(skill.description)) {
      add('warning', 'skill.description.when', 'La description devrait expliciter quand activer ce skill afin d’améliorer sa découvrabilité.', 'description');
    }
  }

  if (skill.compatibility.length > 500) add('error', 'skill.compatibility.max', 'Le champ compatibility est limité à 500 caractères.', 'compatibility');
  if (!skill.instructions.trim()) add('error', 'skill.instructions.required', 'Ajoutez des instructions procédurales concrètes.', 'instructions');
  if (!skill.examples.trim()) add('warning', 'skill.examples.recommended', 'Ajoutez au moins un exemple d’entrée/sortie ou de scénario d’utilisation.', 'examples');
  if (!skill.edgeCases.trim()) add('warning', 'skill.edge.recommended', 'Documentez les cas limites, erreurs fréquentes ou conditions d’arrêt.', 'edgeCases');

  const metadataKeys = new Set<string>();
  for (const item of skill.metadata) {
    const key = item.key.trim();
    if (!key || !item.value.trim()) add('error', 'skill.metadata.empty', 'Chaque métadonnée doit avoir une clé et une valeur chaîne non vides.', 'metadata');
    if (metadataKeys.has(key)) add('error', 'skill.metadata.duplicate', `La clé metadata « ${key} » est dupliquée.`, 'metadata');
    metadataKeys.add(key);
  }

  const paths = new Set<string>();
  const operationalText = `${skill.instructions}\n${skill.notes}`;
  for (const file of skill.files) {
    if (!RESOURCE_PATH_RE.test(file.path) || file.path.includes('..') || file.path.startsWith('/')) {
      add('error', 'skill.file.path', `Le fichier « ${file.path} » doit être placé sous scripts/, references/ ou assets/ et utiliser un chemin relatif sûr.`, 'files');
    }
    if (paths.has(file.path)) add('error', 'skill.file.duplicate', `Le chemin « ${file.path} » est utilisé plusieurs fois.`, 'files');
    if (file.path.split('/').length > 2) add('warning', 'skill.file.depth', `Le chemin « ${file.path} » est profondément imbriqué. Préférez des ressources à un niveau sous SKILL.md.`, 'files');
    if ((file.path.startsWith('scripts/') || file.path.startsWith('references/')) && !operationalText.includes(file.path) && !operationalText.includes(file.path.split('/').at(-1) || '')) {
      add('warning', 'skill.file.unreferenced', `Expliquez dans les instructions quand utiliser « ${file.path} » afin que la ressource soit chargée ou exécutée au bon moment.`, 'files');
    }
    paths.add(file.path);
  }

  const generatedSkill = buildSkillMarkdown(skill);
  const lineCount = generatedSkill.split('\n').length;
  if (lineCount > 500) add('warning', 'skill.progressive.lines', `Le SKILL.md généré fait ${lineCount} lignes. La spec recommande de rester sous 500 lignes et de déplacer les détails vers references/.`, 'body');

  const approxTokens = Math.ceil(generatedSkill.replace(/^---\n[\s\S]*?\n---\n?/, '').length / 4);
  if (approxTokens > 5000) add('warning', 'skill.progressive.tokens', `Le corps représente environ ${approxTokens.toLocaleString('fr-FR')} tokens. La spec recommande moins de 5 000 tokens pour favoriser la divulgation progressive.`, 'body');

  if (!issues.some((issue) => issue.level === 'error' || issue.level === 'warning')) {
    add('success', 'skill.valid', 'Le skill respecte les contraintes de la spec et les bonnes pratiques contrôlées par l’éditeur.');
  }
  return issues;
}

export function hasErrors(issues: ValidationIssue[]) {
  return issues.some((issue) => issue.level === 'error');
}
