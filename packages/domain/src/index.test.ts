import { describe, expect, it } from "vitest";
import {
  elevationFromMetres,
  elevationToMetres,
  formatElevation,
} from "./index.js";

describe("elevation units", () => {
  it("uses feet with miles and metres with kilometres", () => {
    expect(formatElevation(457.2, "mi")).toBe("1,500 ft");
    expect(formatElevation(457.2, "km")).toBe("457 m");
  });
  it("stores entered feet as metres", () => {
    expect(elevationToMetres(1500, "mi")).toBeCloseTo(457.2);
    expect(elevationFromMetres(elevationToMetres(1500, "mi"), "mi")).toBe(1500);
    expect(elevationToMetres(300, "km")).toBe(300);
  });
});
