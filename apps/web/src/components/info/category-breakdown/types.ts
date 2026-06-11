interface Transaction {
  date: string;
  description: string;
  amount: number;
}

export interface SubCategoryData {
  subCategory: string;
  amount: number;
  transactions: Transaction[];
}

export interface CategoryData {
  category: string;
  amount: number;
  subCategories?: SubCategoryData[];
}
