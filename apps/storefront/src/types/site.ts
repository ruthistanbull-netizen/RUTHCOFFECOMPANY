export type Collection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_image_url: string | null;
  sort_order: number | null;
  status: "draft" | "active" | "archived";
  created_at: string | null;
  updated_at: string | null;
};

export type ProductVariant = {
  id: string;
  sku: string | null;
  barcode: string | null;
  price: number | string | null;
  compare_at_price: number | string | null;
  stock: number | null;
  stock_status: "in_stock" | "out_of_stock" | "preorder";
  is_active: boolean | null;
  options: Record<string, string>;
  option_summary: string;
  ikas_url: string | null;
  image_url?: string | null;
};

export type BundleItem = {
  product_id?: string | null;
  id?: string | null;
  slug?: string | null;
  quantity?: number | null;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  public_slug?: string;
  description?: string | null;
  cover_image_url?: string | null;
  sort_order: number | null;
  status: "draft" | "active" | "archived";
  created_at?: string | null;
  updated_at?: string | null;
};

export type Product = {
  id: string;
  collection_id: string | null;
  collection_ids?: string[] | null;
  category_ids?: string[] | null;
  collection_slugs?: string[] | null;
  category_slugs?: string[] | null;
  category_names?: string[] | null;
  name: string;
  slug: string;
  sku: string | null;
  product_code?: string | null;
  short_description: string | null;
  description: string | null;
  price: number | string | null;
  compare_at_price: number | string | null;
  currency: string | null;
  material: string | null;
  material_note: string | null;
  size_usage?: string | null;
  care_advice?: string | null;
  finish_color: string | null;
  is_adjustable: boolean | null;
  ikas_url: string | null;
  main_image_url: string | null;
  image_urls?: string[] | null;
  variants?: ProductVariant[] | null;
  bundle_items?: BundleItem[] | null;
  is_bundle?: boolean | null;
  product_type?: string | null;
  stock_status: "in_stock" | "out_of_stock" | "preorder";
  status: "draft" | "active" | "archived";
  is_featured: boolean | null;
  is_new: boolean | null;
  sort_order: number | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string | null;
  updated_at: string | null;
  collections?: Pick<Collection, "id" | "name" | "slug" | "description" | "cover_image_url"> | null;
};

export type HomepageSection = {
  id: string;
  section_key: string;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  body: string | null;
  image_url: string | null;
  video_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  sort_order: number | null;
  status: "draft" | "active" | "archived";
};

export type SiteSetting = {
  id: string;
  setting_key: string;
  setting_value: Record<string, unknown>;
  is_public: boolean | null;
};
