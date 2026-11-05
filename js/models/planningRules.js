export const GOAL_DEFINITIONS = [
  { id: 'storage', label: 'Armazenamento' },
  { id: 'tvComfort', label: 'Conforto para assistir TV' },
  { id: 'dining', label: 'Espaço para refeições' },
  { id: 'hosting', label: 'Receber visitas' },
  { id: 'homeOffice', label: 'Home office' },
  { id: 'guestRoom', label: 'Quarto para hóspedes' },
  { id: 'cooking', label: 'Cozinhar frequentemente' },
  { id: 'laundry', label: 'Lavanderia organizada' },
  { id: 'openCirculation', label: 'Espaço livre e circulação' },
  { id: 'decoration', label: 'Decoração' },
  { id: 'easyCleaning', label: 'Facilidade de limpeza' },
  { id: 'durability', label: 'Durabilidade' },
  { id: 'flexibility', label: 'Flexibilidade para mudar os móveis' }
];

export const GOAL_IMPORTANCE = {
  high: { label: 'Alta', score: 3 },
  medium: { label: 'Média', score: 2 },
  low: { label: 'Baixa', score: 1 },
  not_needed: { label: 'Não preciso disso', score: 0 }
};

export const NEED_CRITICALITY = {
  required_for_move: 'Necessário para a mudança',
  important_after_move: 'Importante após a mudança',
  deferrable: 'Pode ser adiado'
};

export const NEED_CRITICALITY_RULES = {
  singleBed: 'required_for_move',
  doubleBed: 'required_for_move',
  guestBed: 'deferrable',
  sofa: 'important_after_move',
  diningTable: 'important_after_move',
  desk: 'important_after_move',
  chair: 'important_after_move',
  refrigerator: 'important_after_move',
  cooktop: 'important_after_move',
  kitchenCounter: 'important_after_move',
  kitchenStorage: 'deferrable',
  washer: 'important_after_move',
  television: 'deferrable',
  mediaConsole: 'deferrable'
};

export const ASSET_CATEGORIES = {
  bed: 'Cama',
  guestBed: 'Cama ou sofá-cama para hóspedes',
  wardrobe: 'Guarda-roupa',
  sofa: 'Sofá',
  diningTable: 'Mesa de refeições',
  desk: 'Mesa de trabalho',
  chair: 'Cadeira',
  refrigerator: 'Geladeira',
  cooktop: 'Fogão ou cooktop',
  kitchenStorage: 'Armário de cozinha',
  kitchenCounter: 'Bancada de cozinha',
  washer: 'Máquina de lavar',
  television: 'Televisão',
  mediaConsole: 'Rack ou painel',
  bathroomCabinet: 'Armário de banheiro'
};

export const STYLE_OPTIONS = [
  'Contemporâneo', 'Minimalista', 'Escandinavo', 'Industrial',
  'Clássico', 'Rústico', 'Natural', 'Retrô'
];

export const DIMENSION_RULES = {
  singleBed: {
    label: 'Cama de solteiro',
    minWidthCm: 78, idealWidthCm: 88, maxWidthCm: 100,
    minDepthCm: 188, idealDepthCm: 198, maxDepthCm: 210,
    preferredHeightCm: 60, heightClass: 'low'
  },
  doubleBed: {
    label: 'Cama de casal',
    minWidthCm: 128, idealWidthCm: 138, maxWidthCm: 158,
    minDepthCm: 188, idealDepthCm: 198, maxDepthCm: 210,
    preferredHeightCm: 60, heightClass: 'low'
  },
  wardrobe: {
    label: 'Guarda-roupa',
    minWidthCm: 100, idealWidthCm: 160, maxWidthCm: 240,
    minDepthCm: 45, idealDepthCm: 60, maxDepthCm: 68,
    preferredHeightCm: 210, heightClass: 'tall', openingMode: 'hinged'
  },
  sofa: {
    label: 'Sofá compacto',
    minWidthCm: 125, idealWidthCm: 165, maxWidthCm: 205,
    minDepthCm: 68, idealDepthCm: 82, maxDepthCm: 100,
    preferredHeightCm: 90, heightClass: 'low'
  },
  diningTable: {
    label: 'Mesa de refeições',
    minWidthCm: 70, idealWidthCm: 120, maxWidthCm: 180,
    minDepthCm: 65, idealDepthCm: 80, maxDepthCm: 100,
    preferredHeightCm: 78, heightClass: 'low'
  },
  desk: {
    label: 'Mesa de trabalho',
    minWidthCm: 80, idealWidthCm: 120, maxWidthCm: 160,
    minDepthCm: 45, idealDepthCm: 60, maxDepthCm: 75,
    preferredHeightCm: 75, heightClass: 'low'
  },
  chair: {
    label: 'Cadeira',
    minWidthCm: 42, idealWidthCm: 50, maxWidthCm: 62,
    minDepthCm: 42, idealDepthCm: 55, maxDepthCm: 65,
    preferredHeightCm: 95, heightClass: 'low'
  },
  refrigerator: {
    label: 'Geladeira',
    minWidthCm: 55, idealWidthCm: 70, maxWidthCm: 90,
    minDepthCm: 60, idealDepthCm: 72, maxDepthCm: 85,
    preferredHeightCm: 190, heightClass: 'tall', openingMode: 'hinged'
  },
  cooktop: {
    label: 'Fogão ou cooktop',
    minWidthCm: 50, idealWidthCm: 60, maxWidthCm: 80,
    minDepthCm: 50, idealDepthCm: 60, maxDepthCm: 75,
    preferredHeightCm: 90, heightClass: 'low'
  },
  kitchenCounter: {
    label: 'Bancada de preparo',
    minWidthCm: 100, idealWidthCm: 180, maxWidthCm: 300,
    minDepthCm: 45, idealDepthCm: 60, maxDepthCm: 70,
    preferredHeightCm: 90, heightClass: 'low'
  },
  kitchenStorage: {
    label: 'Armário de cozinha',
    minWidthCm: 60, idealWidthCm: 120, maxWidthCm: 220,
    minDepthCm: 30, idealDepthCm: 45, maxDepthCm: 65,
    preferredHeightCm: 210, heightClass: 'tall', openingMode: 'hinged'
  },
  washer: {
    label: 'Máquina de lavar',
    minWidthCm: 55, idealWidthCm: 65, maxWidthCm: 75,
    minDepthCm: 55, idealDepthCm: 68, maxDepthCm: 80,
    preferredHeightCm: 90, heightClass: 'low', openingMode: 'front'
  },
  television: {
    label: 'Televisão',
    minWidthCm: 50, idealWidthCm: 100, maxWidthCm: 160,
    minDepthCm: 5, idealDepthCm: 15, maxDepthCm: 30,
    preferredHeightCm: 15, heightClass: 'low'
  },
  mediaConsole: {
    label: 'Rack ou painel',
    minWidthCm: 80, idealWidthCm: 140, maxWidthCm: 200,
    minDepthCm: 25, idealDepthCm: 38, maxDepthCm: 50,
    preferredHeightCm: 60, heightClass: 'low'
  },
  guestBed: {
    label: 'Cama ou sofá-cama para hóspedes',
    minWidthCm: 78, idealWidthCm: 138, maxWidthCm: 158,
    minDepthCm: 188, idealDepthCm: 198, maxDepthCm: 210,
    preferredHeightCm: 60, heightClass: 'low'
  }
};

export const CLEARANCE_RULES = {
  doorSwingDepthCm: 80,
  bedSideAccessCm: 45,
  bedFootAccessCm: 60,
  hingedOpeningCm: 60,
  frontAccessCm: 60,
  chairPullbackCm: 45,
  windowAccessDepthCm: 60,
  windowLowFurnitureMaxHeightCm: 80,
  furnitureGapCm: 5,
  placementStepCm: 10
};

export const RULE_BASIS = 'Heurística inicial do sistema; não é norma técnica. Confirme as medidas do produto e do imóvel.';

export const SPATIAL_RELATIONS = {
  DiningGroup: {
    members: ['diningTable', 'chair'],
    relation: 'chairs_around_table'
  },
  TVGroup: {
    members: ['sofa', 'television', 'mediaConsole'],
    relation: 'sofa_faces_television'
  },
  BedroomGroup: {
    members: ['singleBed', 'doubleBed', 'wardrobe'],
    relation: 'bed_and_storage_nearby'
  },
  WorkGroup: {
    members: ['desk', 'chair'],
    relation: 'chair_faces_desk'
  }
};
