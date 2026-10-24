import {
  CatalogueItem,
  InventoryBundle,
  InventoryVariant,
  ShopSettings
} from '../types/billing';

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  id: 'default',
  shopName: 'alif.',
  tagline: 'Bespoke Ladies Tailoring, Bridal & Boutique Finishing',
  address: 'Daal Kuan College Road',
  city: 'Sahibganj',
  state: 'Jharkhand',
  pinCode: '816109',
  phone: '7250470009',
  whatsappNumber: '917250470009',
  currencyCode: 'INR',
  currencySymbol: '₹',
  invoicePrefix: 'ALIF',
  nextInvoiceSequence: 1,
  taxEnabled: false, // Tax disabled by default; never assume GST registration
  taxLabel: 'Tax',
  taxRatePercent: 0,
  defaultPaymentMethod: 'cash',
  enabledPaymentMethods: ['cash', 'upi', 'bank_transfer', 'other'],
  receiptFooter:
    'Thank you for choosing alif., Sahibganj. Please bring this bill at the time of garment collection.',
  updatedAt: '2026-10-18T00:00:00.000Z'
};

const SEED_TIMESTAMP = '2026-10-18T00:00:00.000Z';

/**
 * Default physical shop inventory variants organized by:
 * Category -> Product Type -> Work/Design -> Colour
 * Keeps different colours as separate variants and keeps purchase cost,
 * default price, and actual invoice selling price strictly separate.
 */
export const DEFAULT_INVENTORY_VARIANTS: InventoryVariant[] = [
  {
    id: 'var-fandy-silk-allover-green',
    sku: 'FAB-FSLK-AOW-GRN',
    name: 'Green Fandy Silk — All-over Work',
    category: 'Fabric',
    productType: 'Fandy Silk',
    workDesign: 'All-over Work',
    color: 'Green',
    unit: 'm',
    purchaseCostPaise: 32000, // ₹320/m purchase cost
    defaultSellingPricePaise: 48000, // ₹480/m reference default
    lowStockThreshold: 3,
    totalQuantity: 12.5,
    notes: 'Embroidered Fandy Silk roll for festive suits & blouses',
    isActive: true,
    isPinned: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'var-fandy-silk-allover-maroon',
    sku: 'FAB-FSLK-AOW-MRN',
    name: 'Maroon Fandy Silk — All-over Work',
    category: 'Fabric',
    productType: 'Fandy Silk',
    workDesign: 'All-over Work',
    color: 'Maroon',
    unit: 'm',
    purchaseCostPaise: 32000,
    defaultSellingPricePaise: 48000,
    lowStockThreshold: 3,
    totalQuantity: 6.25,
    notes: 'Bridal maroon Fandy Silk with all-over zari thread work',
    isActive: true,
    isPinned: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'var-fandy-silk-butti-gold',
    sku: 'FAB-FSLK-SBT-GLD',
    name: 'Champagne Gold Fandy Silk — Small Butti',
    category: 'Fabric',
    productType: 'Fandy Silk',
    workDesign: 'Small Butti',
    color: 'Champagne Gold',
    unit: 'm',
    purchaseCostPaise: 28000,
    defaultSellingPricePaise: 42000,
    lowStockThreshold: 3,
    totalQuantity: 9.5,
    notes: 'Small zari butti weave for kurthis & shararas',
    isActive: true,
    isPinned: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'var-cotton-astar-plain-ivory',
    sku: 'FAB-CAST-PLN-IVR',
    name: 'Ivory Cotton Astar — Plain Lining',
    category: 'Fabric',
    productType: 'Cotton Astar',
    workDesign: 'Plain Lining',
    color: 'Ivory',
    unit: 'm',
    purchaseCostPaise: 6500, // ₹65/m purchase cost
    defaultSellingPricePaise: 10000, // ₹100/m default
    lowStockThreshold: 5,
    totalQuantity: 24,
    notes: 'Pre-shrunk pure cotton astar lining for blouses & suits',
    isActive: true,
    isPinned: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'var-cotton-astar-plain-black',
    sku: 'FAB-CAST-PLN-BLK',
    name: 'Jet Black Cotton Astar — Plain Lining',
    category: 'Fabric',
    productType: 'Cotton Astar',
    workDesign: 'Plain Lining',
    color: 'Jet Black',
    unit: 'm',
    purchaseCostPaise: 6500,
    defaultSellingPricePaise: 10000,
    lowStockThreshold: 5,
    totalQuantity: 18.5,
    notes: 'Fast-colour black cotton lining roll',
    isActive: true,
    isPinned: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'var-organza-scallop-rose',
    sku: 'FAB-ORGZ-SCL-RSE',
    name: 'Dusty Rose Pure Organza — Scallop Zari',
    category: 'Fabric',
    productType: 'Pure Organza',
    workDesign: 'Scallop Zari',
    color: 'Dusty Rose',
    unit: 'm',
    purchaseCostPaise: 38000,
    defaultSellingPricePaise: 55000,
    lowStockThreshold: 3,
    totalQuantity: 2.25, // Low stock out of the box
    notes: 'Delicate organza dupatta & sleeve material',
    isActive: true,
    isPinned: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'var-lace-gota-gold',
    sku: 'LCE-GOTA-CWK-GLD',
    name: 'Antique Gold Gota Patti Lace — Cutwork Border',
    category: 'Lace & Borders',
    productType: 'Gota Patti Lace',
    workDesign: 'Cutwork Border',
    color: 'Antique Gold',
    unit: 'm',
    purchaseCostPaise: 3500,
    defaultSellingPricePaise: 6000,
    lowStockThreshold: 4,
    totalQuantity: 15,
    notes: '2-inch bridal border lace roll',
    isActive: true,
    isPinned: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'var-latkan-bridal-ruby',
    sku: 'TRM-LTKN-KDN-RBY',
    name: 'Ruby Gold Bridal Latkan — Kundan Tassel',
    category: 'Trims & Latkan',
    productType: 'Bridal Latkan',
    workDesign: 'Kundan Tassel',
    color: 'Ruby Gold',
    unit: 'pair',
    purchaseCostPaise: 9000,
    defaultSellingPricePaise: 15000,
    lowStockThreshold: 2,
    totalQuantity: 6,
    notes: 'Handcrafted blouse & lehenga back latkan pair',
    isActive: true,
    isPinned: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  }
];

export const DEFAULT_INVENTORY_BUNDLES: InventoryBundle[] = [
  {
    id: 'bnd-fandy-green-01',
    variantId: 'var-fandy-silk-allover-green',
    bundleCode: 'BND-FSG-01',
    initialQuantity: 4.5,
    remainingQuantity: 4.5,
    unit: 'm',
    purchaseCostPaise: 31000,
    receivedDate: '2026-10-01',
    supplier: 'Surat Silk House',
    notes: 'Older roll — deduct first (FIFO)',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z'
  },
  {
    id: 'bnd-fandy-green-02',
    variantId: 'var-fandy-silk-allover-green',
    bundleCode: 'BND-FSG-02',
    initialQuantity: 8.0,
    remainingQuantity: 8.0,
    unit: 'm',
    purchaseCostPaise: 32500,
    receivedDate: '2026-10-12',
    supplier: 'Surat Silk House',
    notes: 'Fresh 8m festive lot',
    createdAt: '2026-10-12T11:30:00.000Z',
    updatedAt: '2026-10-12T11:30:00.000Z'
  },
  {
    id: 'bnd-fandy-maroon-01',
    variantId: 'var-fandy-silk-allover-maroon',
    bundleCode: 'BND-FSM-01',
    initialQuantity: 6.25,
    remainingQuantity: 6.25,
    unit: 'm',
    purchaseCostPaise: 32000,
    receivedDate: '2026-10-05',
    supplier: 'Surat Silk House',
    createdAt: '2026-10-05T10:00:00.000Z',
    updatedAt: '2026-10-05T10:00:00.000Z'
  },
  {
    id: 'bnd-fandy-gold-01',
    variantId: 'var-fandy-silk-butti-gold',
    bundleCode: 'BND-FSB-01',
    initialQuantity: 9.5,
    remainingQuantity: 9.5,
    unit: 'm',
    purchaseCostPaise: 28000,
    receivedDate: '2026-10-08',
    supplier: 'Varanasi Weaves',
    createdAt: '2026-10-08T10:00:00.000Z',
    updatedAt: '2026-10-08T10:00:00.000Z'
  },
  {
    id: 'bnd-astar-ivory-01',
    variantId: 'var-cotton-astar-plain-ivory',
    bundleCode: 'BND-CAI-01',
    initialQuantity: 24.0,
    remainingQuantity: 24.0,
    unit: 'm',
    purchaseCostPaise: 6500,
    receivedDate: '2026-10-02',
    supplier: 'Kolkata Cotton Mills',
    createdAt: '2026-10-02T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z'
  },
  {
    id: 'bnd-astar-black-01',
    variantId: 'var-cotton-astar-plain-black',
    bundleCode: 'BND-CAB-01',
    initialQuantity: 18.5,
    remainingQuantity: 18.5,
    unit: 'm',
    purchaseCostPaise: 6500,
    receivedDate: '2026-10-04',
    supplier: 'Kolkata Cotton Mills',
    createdAt: '2026-10-04T10:00:00.000Z',
    updatedAt: '2026-10-04T10:00:00.000Z'
  },
  {
    id: 'bnd-organza-rose-01',
    variantId: 'var-organza-scallop-rose',
    bundleCode: 'BND-OSR-01',
    initialQuantity: 2.25,
    remainingQuantity: 2.25,
    unit: 'm',
    purchaseCostPaise: 38000,
    receivedDate: '2026-10-06',
    supplier: 'Jaipur Textiles',
    createdAt: '2026-10-06T10:00:00.000Z',
    updatedAt: '2026-10-06T10:00:00.000Z'
  },
  {
    id: 'bnd-lace-gold-01',
    variantId: 'var-lace-gota-gold',
    bundleCode: 'BND-LGG-01',
    initialQuantity: 15.0,
    remainingQuantity: 15.0,
    unit: 'm',
    purchaseCostPaise: 3500,
    receivedDate: '2026-10-03',
    supplier: 'Jaipur Zari Mart',
    createdAt: '2026-10-03T10:00:00.000Z',
    updatedAt: '2026-10-03T10:00:00.000Z'
  },
  {
    id: 'bnd-latkan-ruby-01',
    variantId: 'var-latkan-bridal-ruby',
    bundleCode: 'BND-LKR-01',
    initialQuantity: 6,
    remainingQuantity: 6,
    unit: 'pair',
    purchaseCostPaise: 9000,
    receivedDate: '2026-10-07',
    supplier: 'Delhi Boutique Trims',
    createdAt: '2026-10-07T10:00:00.000Z',
    updatedAt: '2026-10-07T10:00:00.000Z'
  }
];

/**
 * Default configurable catalogue for ALiF Ladies Tailor.
 * Price ranges and defaults are strictly configurable defaults, never fixed prices.
 */
export const DEFAULT_CATALOGUE_ITEMS: CatalogueItem[] = [
  // Tailoring Services (Never reduce physical inventory stock)
  {
    id: 'srv-astar-blouse',
    name: 'Astar Blouse',
    category: 'service',
    defaultPricePaise: 45000, // ₹450 default
    minPricePaise: 35000,
    maxPricePaise: 75000,
    unit: 'pc',
    description: 'Lined (astar) blouse stitching with custom neck & sleeve finish',
    isActive: true,
    isPinned: true,
    productType: 'Blouse Stitching',
    workDesign: 'Astar Lined',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'srv-plain-blouse',
    name: 'Plain Blouse',
    category: 'service',
    defaultPricePaise: 25000, // ₹250 default
    minPricePaise: 18000,
    maxPricePaise: 40000,
    unit: 'pc',
    description: 'Standard unlined plain blouse stitching & hemming',
    isActive: true,
    isPinned: true,
    productType: 'Blouse Stitching',
    workDesign: 'Plain Unlined',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'srv-fall-pico',
    name: 'Fall & Pico',
    category: 'service',
    defaultPricePaise: 12000, // ₹120 default
    minPricePaise: 8000,
    maxPricePaise: 20000,
    unit: 'saree',
    description: 'Saree fall stitching and edge pico finishing',
    isActive: true,
    isPinned: true,
    productType: 'Saree Finishing',
    workDesign: 'Fall & Pico',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'srv-suit',
    name: 'Suit',
    category: 'service',
    defaultPricePaise: 65000, // ₹650 default
    minPricePaise: 45000,
    maxPricePaise: 110000,
    unit: 'set',
    description: 'Complete salwar kameez suit stitching (with or without lining)',
    isActive: true,
    isPinned: true,
    productType: 'Suit Stitching',
    workDesign: 'Salwar Suit',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'srv-kurti',
    name: 'Kurti',
    category: 'service',
    defaultPricePaise: 40000, // ₹400 default
    minPricePaise: 25000,
    maxPricePaise: 75000,
    unit: 'pc',
    description: 'Everyday or designer kurti stitching',
    isActive: true,
    isPinned: false,
    productType: 'Kurti Stitching',
    workDesign: 'Custom Neckline',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'srv-alter',
    name: 'Alter',
    category: 'service',
    defaultPricePaise: 10000, // ₹100 default
    minPricePaise: 5000,
    maxPricePaise: 30000,
    unit: 'pc',
    description: 'Garment fitting, resizing, zip or length alteration',
    isActive: true,
    productType: 'Alteration',
    workDesign: 'Fitting & Resize',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'srv-patiala',
    name: 'Patiala',
    category: 'service',
    defaultPricePaise: 75000, // ₹750 default
    minPricePaise: 55000,
    maxPricePaise: 120000,
    unit: 'set',
    description: 'Full pleated Patiala salwar suit / bottom stitching',
    isActive: true,
    productType: 'Suit Stitching',
    workDesign: 'Full Patiala Pleats',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'srv-palazzo',
    name: 'Palazzo',
    category: 'service',
    defaultPricePaise: 55000, // ₹550 default
    minPricePaise: 35000,
    maxPricePaise: 90000,
    unit: 'pc',
    description: 'Flared palazzo pant or palazzo suit stitching',
    isActive: true,
    productType: 'Bottoms & Sets',
    workDesign: 'Flared Palazzo',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'srv-gharara',
    name: 'Gharara',
    category: 'service',
    defaultPricePaise: 140000, // ₹1,400 default
    minPricePaise: 100000,
    maxPricePaise: 250000,
    unit: 'set',
    description: 'Traditional jointed flared gharara suit stitching',
    isActive: true,
    productType: 'Bridal & Festive',
    workDesign: 'Jointed Gharara',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'srv-sharara',
    name: 'Sharara',
    category: 'service',
    defaultPricePaise: 135000, // ₹1,350 default
    minPricePaise: 95000,
    maxPricePaise: 240000,
    unit: 'set',
    description: 'Festive flowing sharara suit stitching',
    isActive: true,
    productType: 'Bridal & Festive',
    workDesign: 'Flowing Sharara',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'srv-frock',
    name: 'Frock',
    category: 'service',
    defaultPricePaise: 85000, // ₹850 default
    minPricePaise: 50000,
    maxPricePaise: 160000,
    unit: 'pc',
    description: 'Anarkali frock, gown or pleated dress stitching',
    isActive: true,
    productType: 'Gowns & Dresses',
    workDesign: 'Anarkali / Pleated',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'srv-lehenga',
    name: 'Lehenga',
    category: 'service',
    defaultPricePaise: 220000, // ₹2,200 default
    minPricePaise: 150000,
    maxPricePaise: 450000,
    unit: 'set',
    description: 'Bridal & festive lehenga choli stitching with cancan/astar options',
    isActive: true,
    productType: 'Bridal & Festive',
    workDesign: 'Bridal Lehenga Set',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },

  // Tailoring Materials & Products (Can link to physical inventory variants)
  {
    id: 'prd-fandy-silk-green',
    name: 'Green Fandy Silk — All-over Work',
    category: 'product',
    defaultPricePaise: 48000,
    minPricePaise: 38000,
    maxPricePaise: 65000,
    costPricePaise: 32000,
    unit: 'm',
    inventoryVariantId: 'var-fandy-silk-allover-green',
    productType: 'Fandy Silk',
    workDesign: 'All-over Work',
    color: 'Green',
    isPinned: true,
    description: 'Fabric → Fandy Silk → All-over Work → Green',
    isActive: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'prd-fandy-silk-maroon',
    name: 'Maroon Fandy Silk — All-over Work',
    category: 'product',
    defaultPricePaise: 48000,
    minPricePaise: 38000,
    maxPricePaise: 65000,
    costPricePaise: 32000,
    unit: 'm',
    inventoryVariantId: 'var-fandy-silk-allover-maroon',
    productType: 'Fandy Silk',
    workDesign: 'All-over Work',
    color: 'Maroon',
    description: 'Fabric → Fandy Silk → All-over Work → Maroon',
    isActive: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'prd-fabric',
    name: 'Fabric',
    category: 'product',
    defaultPricePaise: 12000, // ₹120/mtr default
    minPricePaise: 6000,
    maxPricePaise: 60000,
    costPricePaise: 6500,
    unit: 'm',
    inventoryVariantId: 'var-cotton-astar-plain-ivory',
    productType: 'Cotton Astar',
    workDesign: 'Plain Lining',
    color: 'Ivory',
    description: 'Cotton astar lining, crepe, satin or dress fabric material',
    isActive: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'prd-lace',
    name: 'Lace',
    category: 'product',
    defaultPricePaise: 6000, // ₹60/mtr default
    minPricePaise: 2000,
    maxPricePaise: 30000,
    costPricePaise: 3500, // ₹35/mtr optional cost
    unit: 'm',
    inventoryVariantId: 'var-lace-gota-gold',
    productType: 'Gota Patti Lace',
    workDesign: 'Cutwork Border',
    color: 'Antique Gold',
    description: 'Gota patti, zari, velvet or designer border lace',
    isActive: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'prd-latkan',
    name: 'Latkan',
    category: 'product',
    defaultPricePaise: 15000, // ₹150/pair default
    minPricePaise: 5000,
    maxPricePaise: 45000,
    costPricePaise: 9000, // ₹90/pair optional cost
    unit: 'pair',
    inventoryVariantId: 'var-latkan-bridal-ruby',
    productType: 'Bridal Latkan',
    workDesign: 'Kundan Tassel',
    color: 'Ruby Gold',
    description: 'Decorative blouse/lehenga back tassels & latkan pair',
    isActive: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'prd-dori',
    name: 'Dori',
    category: 'product',
    defaultPricePaise: 5000, // ₹50/pc default
    minPricePaise: 2500,
    maxPricePaise: 15000,
    costPricePaise: 2500, // ₹25/pc optional cost
    unit: 'pc',
    productType: 'Piping & Cord',
    workDesign: 'Back Tie Dori',
    color: 'Assorted',
    description: 'Custom fabric piping dori or readymade back tie cord',
    isActive: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'itm-custom',
    name: 'Custom Item',
    category: 'custom',
    defaultPricePaise: 20000, // ₹200 configurable default
    minPricePaise: 1000,
    maxPricePaise: 500000,
    unit: 'item',
    description: 'Custom bespoke work, embroidery, button/tassel work or special add-on',
    isActive: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  }
];
