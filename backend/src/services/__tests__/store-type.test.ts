import { CODES_CUISINE, CODES_ETABLISSEMENT, FAMILLES, genreDuCommerce } from "../store-type.service";

describe("familles de commerces", () => {
  const cuisinesRangees = FAMILLES.flatMap((f) => ("cuisines" in f ? [...f.cuisines] : []));
  const etablissementsRanges = FAMILLES.flatMap((f) => ("etablissements" in f ? [...f.etablissements] : []));

  it("range chaque cuisine dans une famille, et une seule", () => {
    expect([...cuisinesRangees].sort()).toEqual([...CODES_CUISINE].sort());
  });

  it("donne une famille à chaque établissement hors restauration", () => {
    const horsRestauration = CODES_ETABLISSEMENT.filter((code) => code !== "restaurant");
    expect([...etablissementsRanges].sort()).toEqual([...horsRestauration].sort());
  });

  it("lit la famille d'une pizzeria et d'un fleuriste", () => {
    expect(genreDuCommerce({ businessType: "restaurant", cuisineType: "pizza" })).toEqual({
      famille: "pizza",
      genreLibelle: "Pizzas",
    });
    expect(genreDuCommerce({ businessType: "florist", cuisineType: null })).toEqual({
      famille: "flowers",
      genreLibelle: "Fleuriste",
    });
  });

  it("reste muet sur un restaurant sans cuisine", () => {
    expect(genreDuCommerce({ businessType: "restaurant", cuisineType: null })).toEqual({
      famille: null,
      genreLibelle: "Restaurant",
    });
  });
});
