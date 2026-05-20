export type Website = {
  id: number;
  url: string;
  last_content_hash: string | null;
  summary: string | null;
};

export type WebsiteUpdate = {
  id: number;
  website_id: number;
  update_text: string;
  timestamp: string;
};

export type Product = {
  id: number;
  url: string;
  current_price: number | null;
  current_currency: string | null;
  target_price: number | null;
  target_currency: string | null;
  image_url: string | null;
  rating: number | null;
  rating_count: number | null;
};

export type WebsiteItem = {
  title: string;
  url: string;
};

export type PricePoint = {
  id: number;
  product_id: number;
  price: number;
  timestamp: string;
};
