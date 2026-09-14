import { KNOWLEDGE_DATASET } from './ragDataset';

/** @deprecated Use KNOWLEDGE_DATASET. Kept so older imports still resolve. */
export const SPARK_KNOWLEDGE_PACK =
  KNOWLEDGE_DATASET.map((d) => '# ' + d.title + '\n\n' + d.content).join('\n\n---\n\n');

export { KNOWLEDGE_DATASET, KNOWLEDGE_DATASET_VERSION, KNOWLEDGE_DATASET_REFRESHED } from './ragDataset';
