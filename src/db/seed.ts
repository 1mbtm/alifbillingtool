import { CatalogueItem, ShopSettings } from '../types/billing';

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  id: 'default',
  shopName: 'ALiF Ladies Tailor',
  tagline: 'Bespoke Ladies Tailoring, Bridal & Boutique Finishing',
  address: 'Station Road, Near Chowk Bazar',
  city: 'Sahibganj',
  state: 'Jharkhand',
  pinCode: '816109',
  phone: '+91 94311 00000',
  whatsappNumber: '919431100000',
  currencyCode: 'INR',
  currencySymbol: '₹',
  invoicePrefix: 'ALIF',
  nextInvoiceSequence: 1,
  taxEnabled: false, // Tax disabled by default; never assume GST registration
  taxLabel: 'Tax',
  taxRatePercent: 0,
  defaultPaymentMethod: 'cash',
  enabledPaymentMethods: ['cash', 'upi', 'bank_transfer', 'other'],
  receiptFooter: 'Thank you for choosing ALiF Ladies Tailor, Sahibganj. Please bring this bill at the time of garment collection.',
  updatedAt: '2026-10-18T00:00:00.000Z'
};

const SEED_TIMESTAMP = '2026-10-18T00:00:00.000Z';

/**
 * Default configurable catalogue for ALiF Ladies Tailor.
 * Price ranges and defaults are strictly configurable defaults, never fixed prices.
 */
export const DEFAULT_CATALOGUE_ITEMS: CatalogueItem[] = [
  // Tailoring Services
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
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },

  // Tailoring Materials & Products
  {
    id: 'prd-fabric',
    name: 'Fabric',
    category: 'product',
    defaultPricePaise: 12000, // ₹120/mtr default
    minPricePaise: 6000,
    maxPricePaise: 60000,
    costPricePaise: 8500, // ₹85/mtr optional cost
    unit: 'mtr',
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
    unit: 'mtr',
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
