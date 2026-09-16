import React from 'react';
import { ModelSelector } from '../models/ModelSelector';
import type { ImageModelOption, ModelAvailability } from '../../services/modelCatalog';

export type { ImageModelOption, ModelAvailability };
export { SPARK_ID_MODELS, SPARK_IMAGE_MODELS, SPARK_LAYOUT_MODELS } from '../../services/modelCatalog';

interface ModelPickerProps {
  selected: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  isGrid?: boolean;
  availability?: Record<string, ModelAvailability>;
  warmingId?: string | null;
  loadedId?: string | null;
  catalog?: ImageModelOption[];
}

/** Studio/ID image picker — searchable ranked list backed by live :7860 catalog. */
export const ModelPicker: React.FC<ModelPickerProps> = ({ catalog, disabled }) => {
  return <ModelSelector lane="image" variant="panel" catalog={catalog} disabled={disabled} />;
};
