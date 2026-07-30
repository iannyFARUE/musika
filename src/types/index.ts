import { ObjectId } from "mongodb";

export type SuccessResponse<T> = {
  success: true;
  message?: string;
  data: T;
  timestamp: string;
};

export type ErrorResponse = {
  success: false;
  message: string;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
  timestamp: string;
};

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

export interface Product {
  _id?: ObjectId;
  name: string;
  price: number;
  shortDescription?: string;
  description?: string;
  categories?: string[];
  brand?: string;
  tags?: string[];
  seller?: string;
  weightGrams?: number;
  condition?: "new" | "used" | "refurbished";
  imageUrl?: string;
  countryOfOrigin?: string;
  sku?: string;
  rating?: {
    average?: number;
    count?: number;
  };
}

export interface Review {
  _id?: ObjectId;
  product_id: ObjectId;
  name: string;
  email: string;
  rating: number;
  text: string;
  date: Date;
}

export interface CreateProductRequest {
  name: string;
  price: number;
  shortDescription?: string;
  description?: string;
  categories?: string[];
  brand?: string;
  tags?: string[];
  seller?: string;
  weightGrams?: number;
  condition?: "new" | "used" | "refurbished";
  imageUrl?: string;
  countryOfOrigin?: string;
  sku?: string;
}

export interface UpdateProductRequest {
  name?: string;
  price?: number;
  shortDescription?: string;
  description?: string;
  categories?: string[];
  brand?: string;
  tags?: string[];
  seller?: string;
  weightGrams?: number;
  condition?: "new" | "used" | "refurbished";
  imageUrl?: string;
  countryOfOrigin?: string;
  sku?: string;
}

export type RawProductQuery = {
  q?: string;
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  minRating?: string;
  limit?: string;
  skip?: string;
  sortBy?: string;
  sortOrder?: string;
};

export type ProductFilter = {
  $text?: { $search: string };
  categories?: { $regex: RegExp };
  price?: { $gte?: number; $lte?: number };
  "rating.average"?: { $gte?: number };
};
