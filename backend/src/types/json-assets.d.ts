declare module "*.json" {
  const donnees: {
    features: {
      geometry: {
        type: string;
        /** Coordinates GeoJSON, e.g. Polygon: rings → points → [longitude, latitude]. */
        coordinates: number[][][];
      };
      properties: Record<string, unknown>;
    }[];
  };
  export default donnees;
}
