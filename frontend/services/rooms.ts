import type { RoomStyle } from "@shared/types";
import { styles } from "./mock-data";

// TODO(backend): replace with fetch(`${API_URL}/styles`).

export async function getStyles(): Promise<RoomStyle[]> {
  return styles;
}
