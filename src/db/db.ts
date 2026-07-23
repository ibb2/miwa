import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";

import { migrateDatabase } from "./migrations";

const expo = openDatabaseSync("db.db");
migrateDatabase(expo);
const db = drizzle(expo);

export { expo as sqlite };
export default db;
