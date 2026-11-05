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
  high: { label: 'Alta', itemPriority: 'essential', score: 3 },
  medium: { label: 'Média', itemPriority: 'important', score: 2 },
  low: { label: 'Baixa', itemPriority: 'optional', score: 1 },
  not_needed: { label: 'Não preciso disso', itemPriority: null, score: 0 }
};

export const STYLE_OPTIONS = [
  'Contemporâneo', 'Minimalista', 'Escandinavo', 'Industrial',
  'Clássico', 'Rústico', 'Natural', 'Retrô'
];

export const DIMENSION_RULES = {
  singleBed: {
    label: 'Cama de solteiro',
    minWidthCm: 78, idealWidthCm: 88, maxWidthCm: 100,
    minDepthCm: 188, idealDepthCm: 198, maxDepthCm: 210
  },
  doubleBed: {
    label: 'Cama de casal',
    minWidthCm: 128, idealWidthCm: 138, maxWidthCm: 158,
    minDepthCm: 188, idealDepthCm: 198, maxDepthCm: 210
  },
  wardrobe: {
    label: 'Guarda-roupa',
    minWidthCm: 100, idealWidthCm: 160, maxWidthCm: 240,
    minDepthCm: 45, idealDepthCm: 60, maxDepthCm: 68
  },
  sofa: {
    label: 'Sofá compacto',
    minWidthCm: 125, idealWidthCm: 165, maxWidthCm: 205,
    minDepthCm: 68, idealDepthCm: 82, maxDepthCm: 100
  },
  diningTable: {
    label: 'Mesa de refeições',
    minWidthCm: 70, idealWidthCm: 120, maxWidthCm: 180,
    minDepthCm: 65, idealDepthCm: 80, maxDepthCm: 100
  },
  desk: {
    label: 'Mesa de trabalho',
    minWidthCm: 80, idealWidthCm: 120, maxWidthCm: 160,
    minDepthCm: 45, idealDepthCm: 60, maxDepthCm: 75
  },
  chair: {
    label: 'Cadeira',
    minWidthCm: 42, idealWidthCm: 50, maxWidthCm: 62,
    minDepthCm: 42, idealDepthCm: 55, maxDepthCm: 65
  },
  refrigerator: {
    label: 'Geladeira',
    minWidthCm: 55, idealWidthCm: 70, maxWidthCm: 90,
    minDepthCm: 60, idealDepthCm: 72, maxDepthCm: 85
  },
  cooktop: {
    label: 'Fogão ou cooktop',
    minWidthCm: 50, idealWidthCm: 60, maxWidthCm: 80,
    minDepthCm: 50, idealDepthCm: 60, maxDepthCm: 75
  },
  kitchenCounter: {
    label: 'Bancada de preparo',
    minWidthCm: 100, idealWidthCm: 180, maxWidthCm: 300,
    minDepthCm: 45, idealDepthCm: 60, maxDepthCm: 70
  },
  kitchenStorage: {
    label: 'Armário de cozinha',
    minWidthCm: 60, idealWidthCm: 120, maxWidthCm: 220,
    minDepthCm: 30, idealDepthCm: 45, maxDepthCm: 65
  },
  washer: {
    label: 'Máquina de lavar',
    minWidthCm: 55, idealWidthCm: 65, maxWidthCm: 75,
    minDepthCm: 55, idealDepthCm: 68, maxDepthCm: 80
  },
  television: {
    label: 'Televisão',
    minWidthCm: 50, idealWidthCm: 100, maxWidthCm: 160,
    minDepthCm: 5, idealDepthCm: 15, maxDepthCm: 30
  },
  mediaConsole: {
    label: 'Rack ou painel',
    minWidthCm: 80, idealWidthCm: 140, maxWidthCm: 200,
    minDepthCm: 25, idealDepthCm: 38, maxDepthCm: 50
  },
  guestBed: {
    label: 'Cama ou sofá-cama para hóspedes',
    minWidthCm: 78, idealWidthCm: 138, maxWidthCm: 158,
    minDepthCm: 188, idealDepthCm: 198, maxDepthCm: 210
  }
};

export const CLEARANCE_RULES = {
  doorSwingDepthCm: 80,
  furnitureGapCm: 5,
  placementStepCm: 10
};

export const RULE_BASIS = 'Heurística inicial do sistema; não é norma técnica. Confirme as medidas do produto e do imóvel.';
