export type CoffeeProduct = {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  category: "espresso" | "filter" | "single-origin" | "blend";
  origin: string;
  process: string;
  roast: string;
  tastingNotes: string[];
  price: number;
  image: string;
  description: string;
  brewMethods: string[];
  weights: string[];
};

export const coffeeProducts: CoffeeProduct[] = [
  {
    id: "ruth-house-espresso",
    slug: "ruth-house-espresso",
    name: "Ruth House Espresso",
    subtitle: "Chocolate · Caramel · Hazelnut",
    category: "espresso",
    origin: "Brazil · Colombia",
    process: "Natural / Washed",
    roast: "Medium",
    tastingNotes: ["Chocolate", "Caramel", "Hazelnut"],
    price: 540,
    image: "/products/ruth-house-espresso.svg",
    description: "Balanced, sweet and consistent. Built for espresso bars that want body, clarity and easy service all day.",
    brewMethods: ["Espresso", "Moka Pot", "Milk Drinks"],
    weights: ["250g", "500g", "1kg"]
  },
  {
    id: "ethiopia-benti-nenka",
    slug: "ethiopia-benti-nenka",
    name: "Ethiopia Benti Nenka",
    subtitle: "Jasmine · Peach · Bergamot",
    category: "single-origin",
    origin: "Ethiopia · Guji",
    process: "Washed",
    roast: "Light",
    tastingNotes: ["Jasmine", "Peach", "Bergamot"],
    price: 620,
    image: "/products/ethiopia-benti-nenka.svg",
    description: "Floral and clean with a tea-like finish. A bright single origin for pour-over and batch brew.",
    brewMethods: ["V60", "Chemex", "Filter"],
    weights: ["250g", "500g"]
  },
  {
    id: "colombia-el-paraiso",
    slug: "colombia-el-paraiso",
    name: "Colombia El Paraíso",
    subtitle: "Red Apple · Cacao · Brown Sugar",
    category: "filter",
    origin: "Colombia · Cauca",
    process: "Washed",
    roast: "Light-Medium",
    tastingNotes: ["Red Apple", "Cacao", "Brown Sugar"],
    price: 590,
    image: "/products/colombia-el-paraiso.svg",
    description: "Structured sweetness with a round cocoa finish, designed to stay expressive across multiple brew methods.",
    brewMethods: ["V60", "Aeropress", "Filter"],
    weights: ["250g", "500g", "1kg"]
  },
  {
    id: "midnight-blend",
    slug: "midnight-blend",
    name: "Midnight Blend",
    subtitle: "Dark Chocolate · Walnut · Molasses",
    category: "blend",
    origin: "Brazil · Guatemala",
    process: "Natural / Washed",
    roast: "Medium-Dark",
    tastingNotes: ["Dark Chocolate", "Walnut", "Molasses"],
    price: 520,
    image: "/products/midnight-blend.svg",
    description: "Deep, low-acidity and dependable. A comfort-forward blend for classic espresso and milk drinks.",
    brewMethods: ["Espresso", "Moka Pot", "French Press"],
    weights: ["250g", "500g", "1kg"]
  }
];

export const services = [
  ["01", "Café Opening Consulting", "Concept, bar flow, service logic and opening roadmap."],
  ["02", "Coffee Selection", "Coffee matched to your audience, menu and equipment."],
  ["03", "Espresso & Brewing Systems", "Recipes, calibration and repeatable quality standards."],
  ["04", "Menu & Recipe Development", "A focused coffee menu built for speed and consistency."],
  ["05", "Bar Workflow", "Operational flow designed to reduce friction during service."],
  ["06", "Equipment Consulting", "Practical equipment choices based on volume and goals."],
  ["07", "Team Training", "Barista and service training for daily consistency."],
  ["08", "Wholesale Coffee", "Ongoing Ruth Coffee supply for hospitality businesses."],
  ["09", "Business Optimization", "Audit, diagnostics and improvements for existing operations."]
] as const;

export const menuGroups = [
  {
    label: "BUSINESS",
    links: [
      ["Consulting", "/consulting"],
      ["Services", "/consulting#services"],
      ["Wholesale", "/wholesale"],
      ["Book a Consultation", "/book"]
    ]
  },
  {
    label: "SHOP",
    links: [
      ["All Coffee", "/shop"],
      ["Espresso", "/shop?category=espresso"],
      ["Filter", "/shop?category=filter"],
      ["Single Origin", "/shop?category=single-origin"],
      ["Blends", "/shop?category=blend"]
    ]
  },
  {
    label: "RUTH",
    links: [
      ["About", "/about"],
      ["FAQ", "/faq"],
      ["Contact", "/contact"]
    ]
  }
] as const;

export function getProduct(slug: string) {
  return coffeeProducts.find((item) => item.slug === slug);
}
