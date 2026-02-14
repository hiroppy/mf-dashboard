import type { Db } from "../index";
import { schema } from "../index";
import { getOrCreate } from "../utils";

/**
 * Get or create institution category by name
 * Returns the category ID
 */
export async function getOrCreateInstitutionCategory(
  db: Db,
  categoryName: string,
): Promise<number> {
  return await getOrCreate(
    db,
    schema.institutionCategories,
    schema.institutionCategories.name,
    categoryName,
  );
}

/**
 * Get all institution categories
 */
export async function getAllInstitutionCategories(db: Db) {
  return await db
    .select()
    .from(schema.institutionCategories)
    .orderBy(schema.institutionCategories.displayOrder)
    .all();
}
